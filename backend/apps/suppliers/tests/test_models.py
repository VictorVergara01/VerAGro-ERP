from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.inventory.models import Product
from apps.suppliers.models import Supplier, SupplierProduct


@pytest.mark.django_db
def test_supplier_str_and_default_active():
    s = Supplier.objects.create(name="Proveedor Uno")
    assert str(s) == "Proveedor Uno"
    assert s.is_active is True


@pytest.mark.django_db
def test_supplier_product_defaults():
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="SP-1", name="Pieza")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    assert sp.currency == "USD"
    assert sp.is_preferred is False
    assert sp.last_cost == Decimal("0")


@pytest.mark.django_db
def test_supplier_product_unique_together():
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="SP-2", name="Pieza")
    SupplierProduct.objects.create(supplier=s, product=p)
    with pytest.raises(IntegrityError):
        SupplierProduct.objects.create(supplier=s, product=p)
