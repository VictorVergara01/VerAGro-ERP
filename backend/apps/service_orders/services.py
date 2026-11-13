from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.inventory.services import (
    consume_stock,
    release_reservation,
    reserve_stock,
)
from apps.inventory.models import Product

from .models import ServiceOrder, ServiceOrderPart

CENT = Decimal("0.01")
REFERENCE_TYPE = "service_order"


def _q(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def recalculate_totals(order):
    """Recalcula total_amount = mano de obra + diagnóstico + piezas − descuento + impuesto.

    Las piezas devueltas (returned) no suman. total_price de cada pieza se mantiene
    en cuantity*unit_price.
    """
    parts_subtotal = Decimal("0")
    # Consulta fresca (no la caché de prefetch_related, que puede estar obsoleta
    # tras agregar una pieza sobre una orden ya cargada).
    for part in ServiceOrderPart.objects.filter(service_order=order):
        part.total_price = _q(part.quantity * part.unit_price)
        part.save(update_fields=["total_price", "updated_at"])
        if part.status != ServiceOrderPart.Status.RETURNED:
            parts_subtotal += part.total_price

    base = order.labor_cost + order.diagnostic_fee + parts_subtotal
    order.discount_amount = _q(base * order.discount_percentage / Decimal("100"))
    taxable = base - order.discount_amount
    order.tax_amount = _q(taxable * order.tax_percentage / Decimal("100"))
    order.total_amount = _q(base - order.discount_amount + order.tax_amount)
    order.save(
        update_fields=[
            "discount_amount",
            "tax_amount",
            "total_amount",
            "updated_at",
        ]
    )
    return order


@transaction.atomic
def reserve_parts(order, user=None):
    """Reserva las piezas `required` con stock disponible; el resto → pending_purchase.

    Devuelve un resumen {"reserved": [...], "pending": [...]}. Si queda alguna pieza
    pendiente de compra, la orden pasa a waiting_parts.
    """
    order = ServiceOrder.objects.select_for_update().get(pk=order.pk)
    reserved, pending = [], []
    for part in order.parts.select_for_update().filter(
        status__in=[ServiceOrderPart.Status.REQUIRED, ServiceOrderPart.Status.PENDING_PURCHASE],
        inventory_source=ServiceOrderPart.InventorySource.INVENTORY,
    ):
        part.product = Product.objects.select_for_update().get(pk=part.product_id)
        if part.product.available_quantity >= part.quantity:
            reserve_stock(
                product=part.product,
                quantity=part.quantity,
                reference_type=REFERENCE_TYPE,
                reference_id=order.id,
                notes=f"Reserva orden {order.service_order_number}",
                user=user,
            )
            part.status = ServiceOrderPart.Status.RESERVED
            part.save(update_fields=["status", "updated_at"])
            reserved.append(part.id)
        else:
            part.status = ServiceOrderPart.Status.PENDING_PURCHASE
            part.save(update_fields=["status", "updated_at"])
            pending.append(part.id)

    if pending:
        order.status = ServiceOrder.Status.WAITING_PARTS
        order.save(update_fields=["status", "updated_at"])
    return {"reserved": reserved, "pending": pending}


@transaction.atomic
def finish_order(order, user=None):
    """Finaliza la orden: consume las piezas reservadas (service_out) → usadas."""
    ServiceOrder.objects.select_for_update().get(pk=order.pk)
    order.refresh_from_db()
    if order.status != ServiceOrder.Status.IN_PROGRESS:
        raise ValidationError(
            {"status": "Solo se puede finalizar una orden en proceso (in_progress)."}
        )
    summary = reserve_parts(order, user=user)
    if summary["pending"]:
        raise ValidationError({"parts": "Hay piezas sin stock. Regístralas como pendientes de inventario para continuar o recibe la compra."})
    for part in order.parts.filter(status=ServiceOrderPart.Status.RESERVED):
        consume_stock(
            product=part.product,
            quantity=part.quantity,
            was_reserved=True,
            unit_cost=part.unit_cost,
            reference_type=REFERENCE_TYPE,
            reference_id=order.id,
            notes=f"Consumo orden {order.service_order_number}",
            user=user,
        )
        part.status = ServiceOrderPart.Status.USED
        part.save(update_fields=["status", "updated_at"])

    order.status = ServiceOrder.Status.FINISHED
    order.finished_date = timezone.localdate()
    order.save(update_fields=["status", "finished_date", "updated_at"])
    recalculate_totals(order)

    # Al finalizar se genera la factura automáticamente (si aún no existe).
    from apps.billing.models import Invoice
    from apps.billing.services import create_invoice_from_service_order

    has_invoice = order.invoices.exclude(status=Invoice.Status.CANCELLED).exists()
    if not has_invoice:
        create_invoice_from_service_order(order=order, user=user)
    return order


@transaction.atomic
def reconcile_part(*, part, source, product=None, user=None):
    # Serialize with finishing/reserving the same order before locking its part.
    ServiceOrder.objects.select_for_update().get(pk=part.service_order_id)
    part = ServiceOrderPart.objects.select_for_update().get(pk=part.pk)
    if source == "pending" and part.status in (ServiceOrderPart.Status.REQUIRED, ServiceOrderPart.Status.PENDING_PURCHASE):
        if part.service_order.status in ("finished", "invoiced", "delivered", "cancelled"):
            raise ValidationError({"status": "La orden ya está cerrada."})
        part.inventory_source = "pending"
        part.status = ServiceOrderPart.Status.PENDING_INVENTORY
        part.save(update_fields=["inventory_source", "status", "updated_at"])
        return part
    if part.status != ServiceOrderPart.Status.PENDING_INVENTORY:
        raise ValidationError({"status": "Esta pieza no está pendiente de inventario."})
    if source not in ("inventory", "customer", "external", "counted"):
        raise ValidationError({"source": "Selecciona el origen de la pieza."})
    if source in ("inventory", "counted"):
        product = product or part.product
        if product is None or not product.is_active:
            raise ValidationError({"product": "Selecciona un producto activo."})
        if source == "inventory":
            consume_stock(
                product=product, quantity=part.quantity, unit_cost=part.unit_cost,
                reference_type=REFERENCE_TYPE, reference_id=part.service_order_id,
                notes=f"Conciliación de pieza {part.id}", user=user,
            )
        part.product = product
    part.inventory_source = source
    part.status = ServiceOrderPart.Status.USED
    part.reconciled_at = timezone.now()
    part.reconciled_by = user
    part.save(update_fields=["product", "inventory_source", "status", "reconciled_at", "reconciled_by", "updated_at"])
    return part


@transaction.atomic
def cancel_order(order, user=None):
    """Cancela la orden: libera las reservas pendientes (reservation_release) y
    ELIMINA la orden (no queda como 'cancelada' en la lista)."""
    if order.status == ServiceOrder.Status.DELIVERED:
        raise ValidationError(
            {"status": "No se puede cancelar una orden ya entregada."}
        )
    for part in order.parts.filter(status=ServiceOrderPart.Status.RESERVED):
        release_reservation(
            product=part.product,
            quantity=part.quantity,
            reference_type=REFERENCE_TYPE,
            reference_id=order.id,
            notes=f"Cancelación orden {order.service_order_number}",
            user=user,
        )
    order.delete()
