from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product
from apps.inventory.services import apply_adjustment


@pytest.mark.django_db
def test_adjustment_in_increases_stock():
    p = Product.objects.create(sku="A1", name="P", stock_quantity=Decimal("5"))
    m = apply_adjustment(
        product=p, movement_type="adjustment_in", quantity=Decimal("3")
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("8")
    assert m.movement_type == "adjustment_in"
    assert InventoryMovement.objects.filter(product=p).count() == 1


@pytest.mark.django_db
def test_adjustment_out_decreases_stock():
    p = Product.objects.create(sku="A2", name="P", stock_quantity=Decimal("5"))
    apply_adjustment(product=p, movement_type="adjustment_out", quantity=Decimal("2"))
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("3")


@pytest.mark.django_db
def test_adjustment_out_cannot_go_negative():
    p = Product.objects.create(sku="A3", name="P", stock_quantity=Decimal("1"))
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_out", quantity=Decimal("5")
        )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("1")  # intacto
    assert InventoryMovement.objects.filter(product=p).count() == 0


@pytest.mark.django_db
def test_non_adjustment_type_rejected():
    p = Product.objects.create(sku="A4", name="P", stock_quantity=Decimal("1"))
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="purchase_in", quantity=Decimal("1")
        )


@pytest.mark.django_db
def test_non_positive_quantity_rejected():
    p = Product.objects.create(sku="A5", name="P", stock_quantity=Decimal("1"))
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_in", quantity=Decimal("0")
        )


@pytest.mark.django_db
def test_adjustment_out_full_balance_to_zero():
    p = Product.objects.create(sku="A6", name="P", stock_quantity=Decimal("4"))
    apply_adjustment(product=p, movement_type="adjustment_out", quantity=Decimal("4"))
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("0")
