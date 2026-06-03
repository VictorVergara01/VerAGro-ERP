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
        if quantity > locked.stock_quantity:
            raise ValidationError(
                {"quantity": "El ajuste dejaría el stock en negativo."}
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
