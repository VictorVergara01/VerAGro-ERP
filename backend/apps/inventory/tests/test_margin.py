from decimal import Decimal

import pytest

from apps.inventory.models import Product, ProductCategory
from apps.inventory.serializers import ProductSerializer
from apps.inventory.services import apply_category_margin, apply_margin, effective_margin
from apps.inventory.services import effective_margins


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
def test_apply_category_margin_respeta_el_margen_propio_de_cada_producto():
    cat = ProductCategory.objects.create(name="X", default_margin_percentage=Decimal("20"))
    a = Product.objects.create(sku="B1", name="A", category=cat, average_cost=Decimal("50"))
    b = Product.objects.create(
        sku="B2", name="B", category=cat, average_cost=Decimal("50"),
        default_margin_percentage=Decimal("100"),
    )
    apply_category_margin(cat)
    a.refresh_from_db()
    b.refresh_from_db()
    assert a.sale_price == Decimal("60.00")    # 50 * 1.20 (margen heredado de la categoría)
    assert b.sale_price == Decimal("100.00")   # 50 * 2.00 (su propio margen, respetado)


@pytest.mark.django_db
def test_effective_margins_cascada_campo_por_campo():
    cat = ProductCategory.objects.create(
        name="Mixta",
        min_margin_percentage=Decimal("15"),
        default_margin_percentage=Decimal("20"),
        max_margin_percentage=Decimal("35"),
    )
    # El producto sólo define el mínimo: hereda objetivo y máximo de la categoría.
    p = Product.objects.create(
        sku="R1", name="P", category=cat, min_margin_percentage=Decimal("25")
    )
    assert effective_margins(p) == (Decimal("25"), Decimal("20"), Decimal("35"))


@pytest.mark.django_db
def test_effective_margins_sin_categoria_ni_margenes():
    p = Product.objects.create(sku="R2", name="P")
    assert effective_margins(p) == (Decimal("0"), Decimal("0"), Decimal("0"))


@pytest.mark.django_db
def test_apply_margin_calcula_el_rango_sobre_average_cost():
    p = Product.objects.create(
        sku="R3",
        name="Helice",
        average_cost=Decimal("27.50"),
        min_margin_percentage=Decimal("25"),
        default_margin_percentage=Decimal("30"),
        max_margin_percentage=Decimal("45"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.min_sale_price == Decimal("34.38")   # 27.50 * 1.25
    assert p.sale_price == Decimal("35.75")       # 27.50 * 1.30
    assert p.max_sale_price == Decimal("39.88")   # 27.50 * 1.45


@pytest.mark.django_db
def test_rango_colapsa_al_precio_sugerido_si_no_hay_min_max():
    p = Product.objects.create(
        sku="R4",
        name="P",
        average_cost=Decimal("100"),
        default_margin_percentage=Decimal("30"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.min_sale_price == p.sale_price == p.max_sale_price == Decimal("130.00")


@pytest.mark.django_db
def test_sin_costo_base_no_se_toca_ni_el_rango():
    p = Product.objects.create(
        sku="R5",
        name="P",
        average_cost=Decimal("0"),
        sale_price=Decimal("99"),
        min_margin_percentage=Decimal("25"),
        max_margin_percentage=Decimal("45"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.sale_price == Decimal("99.00")
    assert p.min_sale_price == Decimal("0.00")
    assert p.max_sale_price == Decimal("0.00")


@pytest.mark.django_db
def test_editar_margen_minimo_recalcula_el_piso():
    p = Product.objects.create(
        sku="R6", name="P", average_cost=Decimal("100"),
        default_margin_percentage=Decimal("30"),
    )
    apply_margin(p)
    s = ProductSerializer(instance=p, data={"min_margin_percentage": "10"}, partial=True)
    s.is_valid(raise_exception=True)
    s.save()
    p.refresh_from_db()
    assert p.min_sale_price == Decimal("110.00")
    assert p.sale_price == Decimal("130.00")
