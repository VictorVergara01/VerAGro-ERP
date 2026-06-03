import pytest

from apps.inventory.models import Product
from apps.suppliers.models import Supplier, SupplierProduct
from apps.suppliers.serializers import (
    SupplierProductSerializer,
    SupplierSerializer,
)


@pytest.mark.django_db
def test_supplier_serializer_roundtrip():
    s = SupplierSerializer(data={"name": "Prov X", "email": "a@b.com"})
    assert s.is_valid(), s.errors
    obj = s.save()
    assert obj.name == "Prov X"


@pytest.mark.django_db
def test_supplier_product_serializer_exposes_readonly_names():
    s = Supplier.objects.create(name="ProvName")
    p = Product.objects.create(sku="SER-1", name="PieceName")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    data = SupplierProductSerializer(sp).data
    assert data["product_sku"] == "SER-1"
    assert data["supplier_name"] == "ProvName"


@pytest.mark.django_db
def test_supplier_product_serializer_duplicate_rejected():
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="SER-2", name="P")
    SupplierProduct.objects.create(supplier=s, product=p)
    ser = SupplierProductSerializer(
        data={"supplier": s.id, "product": p.id}
    )
    assert ser.is_valid() is False  # UniqueTogetherValidator
