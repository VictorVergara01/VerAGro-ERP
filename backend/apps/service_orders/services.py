from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.inventory.services import (
    consume_stock,
    release_reservation,
    reserve_stock,
)

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

    order.total_amount = _q(
        order.labor_cost
        + order.diagnostic_fee
        + parts_subtotal
        - order.discount_amount
        + order.tax_amount
    )
    order.save(update_fields=["total_amount", "updated_at"])
    return order


@transaction.atomic
def reserve_parts(order, user=None):
    """Reserva las piezas `required` con stock disponible; el resto → pending_purchase.

    Devuelve un resumen {"reserved": [...], "pending": [...]}. Si queda alguna pieza
    pendiente de compra, la orden pasa a waiting_parts.
    """
    reserved, pending = [], []
    for part in order.parts.filter(status=ServiceOrderPart.Status.REQUIRED):
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
    if order.status != ServiceOrder.Status.IN_PROGRESS:
        raise ValidationError(
            {"status": "Solo se puede finalizar una orden en proceso (in_progress)."}
        )
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
    return order


@transaction.atomic
def cancel_order(order, user=None):
    """Cancela la orden y libera las reservas pendientes (reservation_release)."""
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
        part.status = ServiceOrderPart.Status.RETURNED
        part.save(update_fields=["status", "updated_at"])

    order.status = ServiceOrder.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    return order
