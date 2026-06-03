import pytest

from apps.inventory.models import Product
from apps.suppliers.models import Supplier


@pytest.mark.django_db
def test_product_main_supplier_assignable():
    s = Supplier.objects.create(name="Prov Principal")
    p = Product.objects.create(sku="MS-1", name="Pieza")
    p.main_supplier = s
    p.save(update_fields=["main_supplier"])
    p.refresh_from_db()
    assert p.main_supplier == s
    assert list(s.main_for_products.all()) == [p]


@pytest.mark.django_db
def test_product_main_supplier_set_null_on_supplier_delete():
    s = Supplier.objects.create(name="Prov")
    p = Product.objects.create(sku="MS-2", name="Pieza", main_supplier=s)
    s.delete()  # hard delete
    p.refresh_from_db()
    assert p.main_supplier is None  # SET_NULL
