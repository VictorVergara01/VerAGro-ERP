from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement
from apps.inventory.services import consume_stock

from .models import (
    Invoice,
    InvoiceLine,
    LineType,
    Payment,
)

CENT = Decimal("0.01")


def _q(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def recalculate_invoice(invoice):
    subtotal = Decimal("0")
    # Consulta fresca (evita la caché de prefetch_related ya cargada en la vista).
    for line in InvoiceLine.objects.filter(invoice=invoice):
        line_base = line.quantity * line.unit_price
        line.margin_amount = _q((line.unit_price - line.unit_cost) * line.quantity)
        line.total = _q(line_base - line.discount_amount + line.tax_amount)
        line.save(update_fields=["margin_amount", "total", "updated_at"])
        subtotal += line_base

    paid = sum(
        (p.amount for p in Payment.objects.filter(invoice=invoice)), Decimal("0")
    )
    invoice.subtotal = _q(subtotal)
    invoice.discount_amount = _q(subtotal * invoice.discount_percentage / Decimal("100"))
    taxable = invoice.subtotal - invoice.discount_amount
    invoice.tax_amount = _q(taxable * invoice.tax_percentage / Decimal("100"))
    invoice.total = _q(invoice.subtotal - invoice.discount_amount + invoice.tax_amount)
    invoice.paid_amount = _q(paid)
    invoice.balance_due = _q(invoice.total - invoice.paid_amount)

    # El estado de pago solo aplica a facturas emitidas (no draft/cancelled).
    if invoice.status in (
        Invoice.Status.ISSUED,
        Invoice.Status.PARTIALLY_PAID,
        Invoice.Status.PAID,
    ):
        # Una factura de total 0 (p.ej. diagnóstico gratis/garantía) queda saldada:
        # no hay nada que cobrar.
        if invoice.total <= 0 or invoice.paid_amount >= invoice.total:
            invoice.status = Invoice.Status.PAID
        elif invoice.paid_amount > 0:
            invoice.status = Invoice.Status.PARTIALLY_PAID
        else:
            invoice.status = Invoice.Status.ISSUED

    invoice.save(
        update_fields=[
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "paid_amount",
            "balance_due",
            "status",
            "updated_at",
        ]
    )
    return invoice


def _service_order_lines(order):
    """Construye la lista de dicts de línea desde una orden de servicio."""
    lines = []
    if order.labor_cost and order.labor_cost > 0:
        lines.append(
            {
                "description": "Mano de obra",
                "quantity": Decimal("1"),
                "unit_price": order.labor_cost,
                "line_type": LineType.LABOR,
            }
        )
    if order.diagnostic_fee and order.diagnostic_fee > 0:
        lines.append(
            {
                "description": "Diagnóstico",
                "quantity": Decimal("1"),
                "unit_price": order.diagnostic_fee,
                "line_type": LineType.DIAGNOSTIC,
            }
        )
    for part in order.parts.exclude(status="returned").select_related("product"):
        lines.append(
            {
                "product": part.product,
                "description": part.description or (part.product.name if part.product_id else "Pieza manual"),
                "quantity": part.quantity,
                "unit_price": part.unit_price,
                "unit_cost": part.unit_cost,
                "line_type": LineType.PRODUCT,
            }
        )
    return lines


@transaction.atomic
def create_invoice_from_service_order(*, order, user=None):
    from apps.service_orders.models import ServiceOrder

    if order.status != ServiceOrder.Status.FINISHED:
        raise ValidationError(
            {"status": "Solo se factura una orden finalizada (finished)."}
        )
    if order.invoices.exclude(status=Invoice.Status.CANCELLED).exists():
        raise ValidationError({"detail": "La orden ya tiene una factura."})
    invoice = Invoice.objects.create(
        invoice_type=Invoice.InvoiceType.SERVICE,
        customer=order.customer,
        service_order=order,
        discount_percentage=order.discount_percentage,
        tax_percentage=order.tax_percentage,
        created_by=user,
    )
    for data in _service_order_lines(order):
        InvoiceLine.objects.create(
            invoice=invoice,
            product=data.get("product"),
            description=data.get("description", ""),
            quantity=data["quantity"],
            unit_price=data["unit_price"],
            unit_cost=data.get("unit_cost", 0),
            line_type=data["line_type"],
        )
    recalculate_invoice(invoice)
    return invoice


@transaction.atomic
def create_invoice_from_field_job(*, job, user=None):
    from apps.field_jobs.models import FieldJob

    FieldJob.objects.select_for_update().get(pk=job.pk)
    job.refresh_from_db()

    if job.status not in (FieldJob.Status.DONE, FieldJob.Status.INVOICED):
        raise ValidationError(
            {"status": "Solo se factura un trabajo de campo hecho (done)."}
        )
    if job.invoices.exclude(status=Invoice.Status.CANCELLED).exists():
        raise ValidationError({"detail": "El trabajo ya tiene una factura."})

    if not job.actual_hectares:
        raise ValidationError({"actual_hectares": "Registra el área realmente trabajada antes de facturar."})
    if job.billing_unit == "qq" and (job.job_type != FieldJob.JobType.SPREADING or not job.applied_quintals or job.applied_quintals <= 0):
        raise ValidationError({"applied_quintals": "Registra los qq realmente aplicados antes de facturar."})
    quantity = job.billable_quantity
    unit_word = job.billing_unit
    type_word = "Aplicación de sólidos" if job.job_type == FieldJob.JobType.SPREADING else "Pulverización"
    description = (
        f"{type_word} {quantity:.2f} {unit_word} @ ${job.unit_price:.2f}/{unit_word}"
    )
    if job.job_type == FieldJob.JobType.SPREADING and job.applied_quintals:
        description += f" ({job.actual_hectares:g} ha trabajadas; {job.applied_quintals:g} qq aplicados; {job.actual_quintals_per_hectare:g} qq/ha)"
    if job.location:
        description += f" — {job.location}"

    invoice = Invoice.objects.create(
        invoice_type=Invoice.InvoiceType.FIELD_JOB,
        customer=job.customer,
        field_job=job,
        due_date=job.due_date,
        created_by=user,
    )
    InvoiceLine.objects.create(
        invoice=invoice,
        description=description,
        quantity=quantity,
        unit_price=job.unit_price,
        line_type=LineType.SERVICE,
    )
    recalculate_invoice(invoice)
    from apps.field_jobs.collections import attach_collections
    attach_collections(job, invoice)
    job.status = FieldJob.Status.INVOICED
    job.total = invoice.total
    job.save(update_fields=["status", "total", "updated_at"])
    return invoice


@transaction.atomic
def issue_invoice(*, invoice, user=None):
    if invoice.field_job_id:
        from apps.field_jobs.models import FieldJob
        FieldJob.objects.select_for_update().get(pk=invoice.field_job_id)
    Invoice.objects.select_for_update().get(pk=invoice.pk)
    invoice.refresh_from_db()
    if invoice.status != Invoice.Status.DRAFT:
        raise ValidationError({"status": "Solo se emite una factura en borrador."})

    # Venta directa de productos: descontar inventario al emitir.
    if invoice.invoice_type == Invoice.InvoiceType.PRODUCT_SALE:
        for line in invoice.lines.select_related("product").filter(
            product__isnull=False
        ):
            consume_stock(
                product=line.product,
                quantity=line.quantity,
                unit_cost=line.unit_cost,
                movement_type=InventoryMovement.MovementType.SALE_OUT,
                reference_type="invoice",
                reference_id=invoice.id,
                notes=f"Venta factura {invoice.invoice_number}",
                user=user,
            )

    invoice.status = Invoice.Status.ISSUED
    invoice.save(update_fields=["status", "updated_at"])
    recalculate_invoice(invoice)
    # Si el total es 0, queda pagada al emitir → la orden pasa a facturada.
    _mark_order_invoiced_if_paid(invoice)
    return invoice


def _mark_order_invoiced_if_paid(invoice):
    """Cuando la factura queda totalmente pagada, la orden de servicio asociada
    pasa a 'invoiced' (facturada) para que el técnico solo deba entregarla."""
    from apps.service_orders.models import ServiceOrder

    order = invoice.service_order
    if (
        order is not None
        and invoice.status == Invoice.Status.PAID
        and order.status == ServiceOrder.Status.FINISHED
    ):
        order.status = ServiceOrder.Status.INVOICED
        order.save(update_fields=["status", "updated_at"])


@transaction.atomic
def record_payment(
    *,
    invoice,
    amount,
    method,
    payment_date=None,
    reference_number="",
    notes="",
    user=None,
    request_id=None,
):
    if invoice.field_job_id:
        import uuid
        from django.utils import timezone
        from apps.field_jobs.collections import record_collection
        if invoice.status not in (Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID):
            raise ValidationError({'status': 'Solo se registran pagos de facturas emitidas.'})
        receipt = record_collection(job=invoice.field_job, data={
            'amount': amount, 'method': method, 'payment_date': payment_date or timezone.localdate(),
            'reference': reference_number or '', 'notes': notes or '', 'request_id': request_id or uuid.uuid4(),
        }, user=user, invoice=invoice)
        return receipt.invoice_payment
    if invoice.status not in (Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID):
        raise ValidationError(
            {"status": "Solo se registran pagos de facturas emitidas."}
        )
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValidationError({"amount": "El monto debe ser mayor que cero."})

    extra = {"payment_date": payment_date} if payment_date else {}
    payment = Payment.objects.create(
        invoice=invoice,
        amount=amount,
        method=method,
        reference_number=reference_number or "",
        notes=notes or "",
        created_by=user,
        **extra,
    )
    recalculate_invoice(invoice)
    _mark_order_invoiced_if_paid(invoice)
    return payment
