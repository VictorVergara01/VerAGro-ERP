from decimal import Decimal

import pytest

from apps.inventory.models import Product, ProductCategory
from apps.inventory.serializers import ProductSerializer
from apps.inventory.services import apply_category_margin, apply_margin, effective_margin


@pytest.mark.django_db
def test_effective_margin_product_over_category():
    cat = ProductCategory.objects.create(name="Filtros", default_margin_percentage=Decimal("10"))
    p = Product.objects.create(
        sku="A1", name="Filtro", category=cat, default_margin_percentage=Decimal("25")
    )
    assert effective_margin(p) == Decimal("25")


@pytest.mark.django_db
def test_effective_margin_falls_back_to_category():
    cat = ProductCategory.objects.create(name="Filtros", default_margin_percentage=Decimal("10"))
    p = Product.objects.create(sku="A2", name="Filtro", category=cat)  # margin 0
    assert effective_margin(p) == Decimal("10")


@pytest.mark.django_db
def test_effective_margin_zero_when_none():
    p = Product.objects.create(sku="A3", name="Pieza")
    assert effective_margin(p) == Decimal("0")


@pytest.mark.django_db
def test_apply_margin_uses_average_cost():
    p = Product.objects.create(
        sku="A4", name="Pieza", average_cost=Decimal("100"), default_margin_percentage=Decimal("30")
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.sale_price == Decimal("130.00")


@pytest.mark.django_db
def test_apply_margin_without_cost_keeps_manual_price():
    p = Product.objects.create(
        sku="A5", name="P", average_cost=Decimal("0"),
        sale_price=Decimal("99"), default_margin_percentage=Decimal("30"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.sale_price == Decimal("99.00")  # sin costo base, no se toca el precio


@pytest.mark.django_db
def test_serializer_recomputes_price_on_category_change():
    cat = ProductCategory.objects.create(name="ConMargen", default_margin_percentage=Decimal("20"))
    p = Product.objects.create(sku="A6", name="P", average_cost=Decimal("10"))
    s = ProductSerializer(instance=p, data={"category": cat.id}, partial=True)
    s.is_valid(raise_exception=True)
    s.save()
    p.refresh_from_db()
    assert p.sale_price == Decimal("12.00")  # 10 * 1.20 al asignar la categoría


@pytest.mark.django_db
def test_apply_category_margin_only_products_without_own_margin():
    cat = ProductCategory.objects.create(name="X", default_margin_percentage=Decimal("20"))
    a = Product.objects.create(sku="B1", name="A", category=cat, average_cost=Decimal("50"))
    b = Product.objects.create(
        sku="B2", name="B", category=cat, average_cost=Decimal("50"),
        default_margin_percentage=Decimal("100"),
    )
    apply_category_margin(cat)
    a.refresh_from_db()
    b.refresh_from_db()
    assert a.sale_price == Decimal("60.00")   # 50 * 1.20 (margen de categoría)
    assert b.sale_price == Decimal("0.00")    # tiene margen propio → no lo toca aquí
