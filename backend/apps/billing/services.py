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
    Quote,
    QuoteLine,
)

CENT = Decimal("0.01")


def _q(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def recalculate_quote(quote):
    subtotal = Decimal("0")
    # Consulta fresca (evita la caché de prefetch_related ya cargada en la vista).
    for line in QuoteLine.objects.filter(quote=quote):
        line_base = line.quantity * line.unit_price
        line.total = _q(line_base - line.discount_amount + line.tax_amount)
        line.save(update_fields=["total", "updated_at"])
        subtotal += line_base
    quote.subtotal = _q(subtotal)
    quote.discount_amount = _q(subtotal * quote.discount_percentage / Decimal("100"))
    taxable = quote.subtotal - quote.discount_amount
    quote.tax_amount = _q(taxable * quote.tax_percentage / Decimal("100"))
    quote.total = _q(quote.subtotal - quote.discount_amount + quote.tax_amount)
    quote.save(
        update_fields=[
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "updated_at",
        ]
    )
    return quote


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
        if invoice.paid_amount >= invoice.total and invoice.total > 0:
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
                "description": part.product.name,
                "quantity": part.quantity,
                "unit_price": part.unit_price,
                "unit_cost": part.unit_cost,
                "line_type": LineType.PRODUCT,
            }
        )
    return lines


@transaction.atomic
def create_quote_from_service_order(*, order, user=None):
    quote = Quote.objects.create(
        customer=order.customer,
        service_order=order,
        discount_percentage=order.discount_percentage,
        tax_percentage=order.tax_percentage,
        created_by=user,
    )
    for data in _service_order_lines(order):
        QuoteLine.objects.create(
            quote=quote,
            product=data.get("product"),
            description=data.get("description", ""),
            quantity=data["quantity"],
            unit_price=data["unit_price"],
            line_type=data["line_type"],
        )
    recalculate_quote(quote)
    return quote


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
def convert_quote_to_invoice(*, quote, user=None):
    if quote.status != Quote.Status.APPROVED:
        raise ValidationError(
            {"status": "Solo se convierte una cotización aprobada."}
        )
    invoice = Invoice.objects.create(
        invoice_type=Invoice.InvoiceType.FINAL,
        customer=quote.customer,
        service_order=quote.service_order,
        quote=quote,
        discount_percentage=quote.discount_percentage,
        tax_percentage=quote.tax_percentage,
        created_by=user,
    )
    for line in quote.lines.all():
        InvoiceLine.objects.create(
            invoice=invoice,
            product=line.product,
            description=line.description,
            quantity=line.quantity,
            unit_price=line.unit_price,
            unit_cost=line.product.average_cost if line.product else 0,
            discount_amount=line.discount_amount,
            tax_amount=line.tax_amount,
            line_type=line.line_type,
        )
    quote.status = Quote.Status.CONVERTED
    quote.save(update_fields=["status", "updated_at"])
    recalculate_invoice(invoice)
    return invoice


@transaction.atomic
def issue_invoice(*, invoice, user=None):
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
):
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
