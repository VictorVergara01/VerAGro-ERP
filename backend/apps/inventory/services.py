from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import InventoryMovement, Product

ADJUSTMENT_TYPES = {
    InventoryMovement.MovementType.ADJUSTMENT_IN,
    InventoryMovement.MovementType.ADJUSTMENT_OUT,
}


@transaction.atomic
def apply_adjustment(*, product, movement_type, quantity, unit_cost=0, notes="", user=None):
    """Aplica un ajuste manual de stock de forma atómica.

    Solo admite adjustment_in / adjustment_out. quantity debe ser > 0.
    adjustment_out no puede dejar el stock negativo. Crea el InventoryMovement
    y actualiza stock_quantity en la misma transacción.
    """
    if movement_type not in ADJUSTMENT_TYPES:
        raise ValidationError(
            {"movement_type": "Solo se permiten ajustes (adjustment_in/adjustment_out)."}
        )
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)

    if movement_type == "adjustment_out":
        # Se valida contra available_quantity (stock − reservado): no se puede
        # ajustar a la baja stock que ya está reservado para una orden.
        if quantity > locked.available_quantity:
            raise ValidationError(
                {"quantity": "El ajuste dejaría el stock disponible en negativo."}
            )
        locked.stock_quantity = locked.stock_quantity - quantity
    else:  # adjustment_in
        locked.stock_quantity = locked.stock_quantity + quantity

    # updated_at es auto_now pero NO se actualiza si se omite de update_fields.
    locked.save(update_fields=["stock_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=unit_cost or 0,
        notes=notes or "",
        created_by=user,
    )


@transaction.atomic
def reserve_stock(
    *, product, quantity, reference_type="", reference_id=None, notes="", user=None
):
    """Reserva stock disponible de un producto (no descuenta stock físico).

    Incrementa reserved_quantity y registra un movimiento ``reservation``.
    Falla si la cantidad supera el disponible (stock − reservado).
    """
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)
    if quantity > locked.available_quantity:
        raise ValidationError(
            {"quantity": "No hay stock disponible suficiente para reservar."}
        )
    locked.reserved_quantity = locked.reserved_quantity + quantity
    locked.save(update_fields=["reserved_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=InventoryMovement.MovementType.RESERVATION,
        quantity=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes or "",
        created_by=user,
    )


@transaction.atomic
def release_reservation(
    *, product, quantity, reference_type="", reference_id=None, notes="", user=None
):
    """Libera una reserva previa (devuelve disponibilidad, no toca stock físico).

    Decrementa reserved_quantity (sin bajar de 0) y registra ``reservation_release``.
    """
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)
    released = min(quantity, locked.reserved_quantity)
    locked.reserved_quantity = locked.reserved_quantity - released
    locked.save(update_fields=["reserved_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=InventoryMovement.MovementType.RESERVATION_RELEASE,
        quantity=released,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes or "",
        created_by=user,
    )


@transaction.atomic
def consume_stock(
    *,
    product,
    quantity,
    was_reserved=False,
    unit_cost=0,
    movement_type=InventoryMovement.MovementType.SERVICE_OUT,
    reference_type="",
    reference_id=None,
    notes="",
    user=None,
):
    """Descuenta stock físico por consumo (servicio) o venta directa.

    Decrementa stock_quantity (guard de no-negativo). Si la pieza estaba
    reservada, también libera la reserva (reserved_quantity -= quantity).
    Registra un movimiento de salida (``service_out`` por defecto; ``sale_out``
    para ventas directas).
    """
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)
    if quantity > locked.stock_quantity:
        raise ValidationError({"quantity": "Stock insuficiente para el consumo."})
    locked.stock_quantity = locked.stock_quantity - quantity
    if was_reserved:
        released = min(quantity, locked.reserved_quantity)
        locked.reserved_quantity = locked.reserved_quantity - released
    locked.save(update_fields=["stock_quantity", "reserved_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=unit_cost or 0,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes or "",
        created_by=user,
    )
