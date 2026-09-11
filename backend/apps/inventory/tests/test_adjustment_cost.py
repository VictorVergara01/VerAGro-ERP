from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product, ProductCategory
from apps.inventory.services import apply_adjustment


@pytest.fixture
def categoria(db):
    return ProductCategory.objects.create(
        name="Repuestos", default_margin_percentage=Decimal("30")
    )


@pytest.mark.django_db
def test_entrada_sin_costo_es_rechazada(categoria):
    p = Product.objects.create(sku="AJ1", name="P", category=categoria)
    with pytest.raises(ValidationError) as exc:
        apply_adjustment(
            product=p, movement_type="adjustment_in", quantity=Decimal("5")
        )
    assert "unit_cost" in exc.value.detail


@pytest.mark.django_db
def test_entrada_con_costo_mueve_el_promedio(categoria):
    p = Product.objects.create(
        sku="AJ2", name="P", category=categoria,
        stock_quantity=Decimal("10"), average_cost=Decimal("20"),
    )
    apply_adjustment(
        product=p, movement_type="adjustment_in",
        quantity=Decimal("10"), unit_cost=Decimal("30"),
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("20.00")
    assert p.average_cost == Decimal("25.00")   # (10*20 + 10*30) / 20
    assert p.sale_price == Decimal("32.50")     # 25 * 1.30, recalculado


@pytest.mark.django_db
def test_entrada_registra_el_promedio_resultante(categoria):
    p = Product.objects.create(sku="AJ3", name="P", category=categoria)
    movimiento = apply_adjustment(
        product=p, movement_type="adjustment_in",
        quantity=Decimal("4"), unit_cost=Decimal("15"),
    )
    assert movimiento.average_cost_after == Decimal("15.00")


@pytest.mark.django_db
def test_salida_no_altera_el_promedio(categoria):
    p = Product.objects.create(
        sku="AJ4", name="P", category=categoria,
        stock_quantity=Decimal("10"), average_cost=Decimal("20"),
    )
    movimiento = apply_adjustment(
        product=p, movement_type="adjustment_out", quantity=Decimal("3")
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("7.00")
    assert p.average_cost == Decimal("20.00")
    # La salida se valoriza al promedio vigente.
    assert movimiento.unit_cost == Decimal("20.0000")
    assert movimiento.average_cost_after == Decimal("20.00")


@pytest.mark.django_db
def test_salida_sigue_bloqueando_stock_negativo(categoria):
    p = Product.objects.create(
        sku="AJ5", name="P", category=categoria, stock_quantity=Decimal("2")
    )
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_out", quantity=Decimal("5")
        )
