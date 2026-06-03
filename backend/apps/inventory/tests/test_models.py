from decimal import Decimal

import pytest

from apps.equipment.models import EquipmentType
from apps.inventory.models import InventoryMovement, Product, ProductCategory


@pytest.mark.django_db
def test_category_str():
    c = ProductCategory.objects.create(name="Hélices")
    assert str(c) == "Hélices"
    assert c.is_active is True


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
