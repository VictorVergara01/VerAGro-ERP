from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.equipment.models import EquipmentType
from apps.inventory.models import InventoryMovement, Product, ProductCategory


@pytest.mark.django_db
def test_category_str():
    c = ProductCategory.objects.create(name="Hélices")
    assert str(c) == "Hélices"
    assert c.is_active is True


@pytest.mark.django_db
def test_category_clean_rechaza_minimo_mayor_que_maximo():
    # M2: el spec pide la validación del trío de márgenes en Product.clean() Y en
    # el serializer; sin esto, el admin de Django (o shell) puede guardar un
    # min > max saltándose el serializer.
    c = ProductCategory(
        name="Categoría inválida",
        min_margin_percentage=Decimal("50"),
        max_margin_percentage=Decimal("10"),
    )
    with pytest.raises(ValidationError) as exc:
        c.full_clean()
    assert "min_margin_percentage" in exc.value.message_dict


@pytest.mark.django_db
def test_product_clean_rechaza_minimo_mayor_que_maximo():
    p = Product(
        sku="SKU-CLEAN",
        name="Producto inválido",
        min_margin_percentage=Decimal("50"),
        max_margin_percentage=Decimal("10"),
    )
    with pytest.raises(ValidationError) as exc:
        p.full_clean()
    assert "min_margin_percentage" in exc.value.message_dict


@pytest.mark.django_db
def test_product_available_quantity():
    p = Product.objects.create(
        sku="SKU-1", name="Hélice T50",
        stock_quantity=Decimal("10"), reserved_quantity=Decimal("3"),
    )
    assert p.available_quantity == Decimal("7")
    assert str(p) == "Hélice T50"
    assert p.is_active is True


@pytest.mark.django_db
def test_product_compatible_equipment_types_m2m():
    t = EquipmentType.objects.create(name="TipoTestInv")
    p = Product.objects.create(sku="SKU-2", name="Bomba X")
    p.compatible_equipment_types.add(t)
    assert list(p.compatible_equipment_types.all()) == [t]
    assert list(t.compatible_products.all()) == [p]


@pytest.mark.django_db
def test_inventory_movement_str():
    p = Product.objects.create(sku="SKU-3", name="Filtro")
    m = InventoryMovement.objects.create(
        product=p, movement_type="adjustment_in", quantity=Decimal("5")
    )
    assert "adjustment_in" in str(m)
    assert m.created_at is not None
