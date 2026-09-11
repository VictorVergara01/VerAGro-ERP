from decimal import Decimal

import pytest

from apps.inventory.models import InventoryMovement, Product


@pytest.mark.django_db
def test_movimiento_guarda_promedio_resultante():
    p = Product.objects.create(sku="M1", name="P")
    m = InventoryMovement.objects.create(
        product=p,
        movement_type=InventoryMovement.MovementType.PURCHASE_IN,
        quantity=Decimal("10"),
        unit_cost=Decimal("25.1234"),
        average_cost_after=Decimal("27.50"),
    )
    m.refresh_from_db()
    assert m.average_cost_after == Decimal("27.50")


@pytest.mark.django_db
def test_unit_cost_conserva_cuatro_decimales():
    p = Product.objects.create(sku="M2", name="P")
    m = InventoryMovement.objects.create(
        product=p,
        movement_type=InventoryMovement.MovementType.PURCHASE_IN,
        quantity=Decimal("3"),
        unit_cost=Decimal("25.1234"),
    )
    m.refresh_from_db()
    assert m.unit_cost == Decimal("25.1234")


@pytest.mark.django_db
def test_purchase_order_line_es_opcional():
    p = Product.objects.create(sku="M3", name="P")
    m = InventoryMovement.objects.create(
        product=p,
        movement_type=InventoryMovement.MovementType.ADJUSTMENT_IN,
        quantity=Decimal("1"),
    )
    assert m.purchase_order_line is None
