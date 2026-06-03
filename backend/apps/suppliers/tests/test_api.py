import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.suppliers.models import Supplier, SupplierProduct

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def inv_client(db):
    return _client("inventory")


@pytest.mark.django_db
def test_create_supplier(inv_client):
    resp = inv_client.post("/api/suppliers/", {"name": "Prov Uno"}, format="json")
    assert resp.status_code == 201
    assert resp.data["name"] == "Prov Uno"


@pytest.mark.django_db
def test_search_supplier_by_name(inv_client):
    Supplier.objects.create(name="DronesPanama")
    Supplier.objects.create(name="Otro")
    resp = inv_client.get("/api/suppliers/?search=Drones")
    names = [s["name"] for s in resp.data["results"]]
    assert names == ["DronesPanama"]


@pytest.mark.django_db
def test_soft_delete_supplier(inv_client):
    s = Supplier.objects.create(name="Borrar")
    resp = inv_client.delete(f"/api/suppliers/{s.id}/")
    assert resp.status_code == 204
    s.refresh_from_db()
    assert s.is_active is False


@pytest.mark.django_db
def test_list_excludes_inactive(inv_client):
    Supplier.objects.create(name="Activo")
    Supplier.objects.create(name="Inactivo", is_active=False)
    resp = inv_client.get("/api/suppliers/")
    names = [s["name"] for s in resp.data["results"]]
    assert "Activo" in names and "Inactivo" not in names


@pytest.mark.django_db
def test_nested_products_get_and_post(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="N-1", name="Pieza")
    resp = inv_client.post(
        f"/api/suppliers/{s.id}/products/",
        {"product": p.id, "last_cost": "12.50"},
        format="json",
    )
    assert resp.status_code == 201
    assert SupplierProduct.objects.filter(supplier=s, product=p).count() == 1
    resp_get = inv_client.get(f"/api/suppliers/{s.id}/products/")
    assert resp_get.status_code == 200
    assert len(resp_get.data) == 1


@pytest.mark.django_db
def test_purchase_history_placeholder(inv_client):
    s = Supplier.objects.create(name="S")
    resp = inv_client.get(f"/api/suppliers/{s.id}/purchase-history/")
    assert resp.status_code == 200
    assert resp.data == []


@pytest.mark.django_db
def test_supplier_products_filter_by_product(inv_client):
    s1 = Supplier.objects.create(name="S1")
    s2 = Supplier.objects.create(name="S2")
    p = Product.objects.create(sku="F-1", name="Pieza")
    p2 = Product.objects.create(sku="F-2", name="Otra")
    SupplierProduct.objects.create(supplier=s1, product=p)
    SupplierProduct.objects.create(supplier=s2, product=p)
    SupplierProduct.objects.create(supplier=s1, product=p2)
    resp = inv_client.get(f"/api/supplier-products/?product={p.id}")
    supplier_ids = sorted(sp["supplier"] for sp in resp.data["results"])
    assert supplier_ids == sorted([s1.id, s2.id])


@pytest.mark.django_db
def test_supplier_products_filter_invalid_returns_400(inv_client):
    resp = inv_client.get("/api/supplier-products/?product=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_supplier_product_mark_preferred(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="PR-1", name="Pieza")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    resp = inv_client.patch(
        f"/api/supplier-products/{sp.id}/", {"is_preferred": True}, format="json"
    )
    assert resp.status_code == 200
    sp.refresh_from_db()
    assert sp.is_preferred is True


@pytest.mark.django_db
def test_supplier_product_duplicate_returns_400(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="D-1", name="Pieza")
    SupplierProduct.objects.create(supplier=s, product=p)
    resp = inv_client.post(
        "/api/supplier-products/",
        {"supplier": s.id, "product": p.id},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_supplier_product_delete(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="DEL-1", name="Pieza")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    resp = inv_client.delete(f"/api/supplier-products/{sp.id}/")
    assert resp.status_code == 204
    assert SupplierProduct.objects.filter(id=sp.id).count() == 0


@pytest.mark.django_db
def test_requires_authentication():
    client = APIClient()
    resp = client.get("/api/suppliers/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_technician_cannot_write():
    client = _client("technician")
    resp = client.post("/api/suppliers/", {"name": "X"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_readonly_cannot_write():
    client = _client("readonly")
    resp = client.post("/api/suppliers/", {"name": "X"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_supplier_products_filter_is_preferred(inv_client):
    s = Supplier.objects.create(name="S")
    p1 = Product.objects.create(sku="IP-1", name="A")
    p2 = Product.objects.create(sku="IP-2", name="B")
    SupplierProduct.objects.create(supplier=s, product=p1, is_preferred=True)
    SupplierProduct.objects.create(supplier=s, product=p2, is_preferred=False)
    # ?is_preferred=true => solo el preferido
    resp = inv_client.get("/api/supplier-products/?is_preferred=true")
    skus = sorted(sp["product_sku"] for sp in resp.data["results"])
    assert skus == ["IP-1"]
    # ?is_preferred= (vacío) => no filtra, devuelve ambos
    resp_empty = inv_client.get("/api/supplier-products/?is_preferred=")
    assert resp_empty.data["count"] == 2
