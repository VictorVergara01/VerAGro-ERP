from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product
from apps.inventory.services import (
    apply_adjustment,
    consume_stock,
    release_reservation,
    reserve_stock,
)


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


@pytest.mark.django_db
def test_adjustment_updates_product_updated_at():
    import time

    p = Product.objects.create(sku="A7", name="P", stock_quantity=Decimal("5"))
    before = p.updated_at
    time.sleep(0.01)
    apply_adjustment(product=p, movement_type="adjustment_in", quantity=Decimal("1"))
    p.refresh_from_db()
    assert p.updated_at > before


@pytest.mark.django_db
def test_adjustment_out_blocks_reserved_stock():
    # stock 10, reservado 8 → disponible 2; ajustar 5 a la baja debe fallar.
    p = Product.objects.create(
        sku="A8", name="P", stock_quantity=Decimal("10"), reserved_quantity=Decimal("8")
    )
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_out", quantity=Decimal("5")
        )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("10")
    assert InventoryMovement.objects.filter(product=p).count() == 0


@pytest.mark.django_db
def test_reserve_stock_increases_reserved():
    p = Product.objects.create(sku="RS1", name="P", stock_quantity=Decimal("10"))
    m = reserve_stock(product=p, quantity=Decimal("4"))
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("4")
    assert p.available_quantity == Decimal("6")
    assert p.stock_quantity == Decimal("10")  # físico intacto
    assert m.movement_type == "reservation"


@pytest.mark.django_db
def test_reserve_stock_over_available_fails():
    p = Product.objects.create(
        sku="RS2", name="P", stock_quantity=Decimal("5"), reserved_quantity=Decimal("3")
    )
    with pytest.raises(ValidationError):
        reserve_stock(product=p, quantity=Decimal("3"))  # disponible solo 2
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("3")


@pytest.mark.django_db
def test_release_reservation_decreases_reserved_not_below_zero():
    p = Product.objects.create(
        sku="RL1", name="P", stock_quantity=Decimal("10"), reserved_quantity=Decimal("4")
    )
    release_reservation(product=p, quantity=Decimal("10"))  # pide más de lo reservado
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("0")
    m = InventoryMovement.objects.get(product=p)
    assert m.movement_type == "reservation_release"
    assert m.quantity == Decimal("4")  # solo libera lo que había


@pytest.mark.django_db
def test_consume_stock_with_reservation():
    p = Product.objects.create(
        sku="CS1", name="P", stock_quantity=Decimal("10"), reserved_quantity=Decimal("4")
    )
    consume_stock(
        product=p, quantity=Decimal("4"), was_reserved=True, unit_cost=Decimal("7")
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("6")
    assert p.reserved_quantity == Decimal("0")
    m = InventoryMovement.objects.get(product=p)
    assert m.movement_type == "service_out"
    assert m.unit_cost == Decimal("7")


@pytest.mark.django_db
def test_consume_stock_without_reservation():
    p = Product.objects.create(sku="CS2", name="P", stock_quantity=Decimal("10"))
    consume_stock(product=p, quantity=Decimal("3"))
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("7")
    assert p.reserved_quantity == Decimal("0")


@pytest.mark.django_db
def test_consume_stock_insufficient_fails():
    p = Product.objects.create(sku="CS3", name="P", stock_quantity=Decimal("2"))
    with pytest.raises(ValidationError):
        consume_stock(product=p, quantity=Decimal("3"))
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("2")
    assert not InventoryMovement.objects.filter(product=p).exists()


@pytest.mark.django_db
def test_consume_stock_sale_out_movement_type():
    p = Product.objects.create(sku="CS4", name="P", stock_quantity=Decimal("5"))
    consume_stock(
        product=p,
        quantity=Decimal("2"),
        movement_type=InventoryMovement.MovementType.SALE_OUT,
        reference_type="invoice",
        reference_id=99,
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("3")
    mov = InventoryMovement.objects.get(product=p)
    assert mov.movement_type == "sale_out"
    assert mov.reference_type == "invoice"


def test_generate_product_sku_formats_pk_with_prefix_and_padding():
    from apps.inventory.services import generate_product_sku

    assert generate_product_sku(42) == "SKU-000042"
    assert generate_product_sku(1) == "SKU-000001"
    assert generate_product_sku(1234567) == "SKU-1234567"
