from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import InventoryMovement, Product, ProductCategory

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
def test_create_product(inv_client):
    resp = inv_client.post(
        "/api/inventory/products/", {"sku": "P-1", "name": "Hélice"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["sku"] == "P-1"


@pytest.mark.django_db
def test_stock_quantity_read_only_on_create(inv_client):
    resp = inv_client.post(
        "/api/inventory/products/",
        {"sku": "P-2", "name": "X", "stock_quantity": "50"},
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(str(resp.data["stock_quantity"])) == Decimal("0")


@pytest.mark.django_db
def test_search_by_sku(inv_client):
    Product.objects.create(sku="ABC-1", name="Uno")
    Product.objects.create(sku="XYZ-2", name="Dos")
    resp = inv_client.get("/api/inventory/products/?search=ABC")
    skus = [p["sku"] for p in resp.data["results"]]
    assert skus == ["ABC-1"]


@pytest.mark.django_db
def test_filter_by_category(inv_client):
    cat = ProductCategory.objects.create(name="Motores")
    Product.objects.create(sku="C-1", name="ConCat", category=cat)
    Product.objects.create(sku="C-2", name="SinCat")
    resp = inv_client.get(f"/api/inventory/products/?category={cat.id}")
    names = [p["name"] for p in resp.data["results"]]
    assert names == ["ConCat"]


@pytest.mark.django_db
def test_invalid_category_filter_returns_400(inv_client):
    resp = inv_client.get("/api/inventory/products/?category=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_soft_delete(inv_client):
    p = Product.objects.create(sku="D-1", name="Borrar")
    resp = inv_client.delete(f"/api/inventory/products/{p.id}/")
    assert resp.status_code == 204
    p.refresh_from_db()
    assert p.is_active is False


@pytest.mark.django_db
def test_list_excludes_inactive_by_default(inv_client):
    Product.objects.create(sku="L-1", name="Activo")
    Product.objects.create(sku="L-2", name="Inactivo", is_active=False)
    resp = inv_client.get("/api/inventory/products/")
    names = [p["name"] for p in resp.data["results"]]
    assert "Activo" in names and "Inactivo" not in names


@pytest.mark.django_db
def test_adjustment_endpoint_increases_stock(inv_client):
    p = Product.objects.create(sku="ADJ-1", name="P", stock_quantity=Decimal("2"))
    resp = inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_in", "quantity": "3"},
        format="json",
    )
    assert resp.status_code == 201
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("5")
    assert InventoryMovement.objects.filter(product=p).count() == 1


@pytest.mark.django_db
def test_adjustment_out_insufficient_returns_400(inv_client):
    p = Product.objects.create(sku="ADJ-2", name="P", stock_quantity=Decimal("1"))
    resp = inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_out", "quantity": "5"},
        format="json",
    )
    assert resp.status_code == 400
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("1")


@pytest.mark.django_db
def test_product_movements_list(inv_client):
    p = Product.objects.create(sku="MV-1", name="P", stock_quantity=Decimal("0"))
    inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_in", "quantity": "4"},
        format="json",
    )
    resp = inv_client.get(f"/api/inventory/products/{p.id}/movements/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["movement_type"] == "adjustment_in"


@pytest.mark.django_db
def test_low_stock(inv_client):
    Product.objects.create(sku="LS-1", name="Bajo", stock_quantity=Decimal("1"), minimum_stock=Decimal("5"))
    Product.objects.create(sku="LS-2", name="Ok", stock_quantity=Decimal("10"), minimum_stock=Decimal("5"))
    resp = inv_client.get("/api/inventory/low-stock/")
    names = [p["name"] for p in resp.data]
    assert "Bajo" in names and "Ok" not in names


@pytest.mark.django_db
def test_categories_readonly(inv_client):
    ProductCategory.objects.create(name="Consumibles")
    resp = inv_client.get("/api/inventory/categories/")
    assert resp.status_code == 200
    names = [c["name"] for c in resp.data]
    assert "Consumibles" in names
    resp_post = inv_client.post("/api/inventory/categories/", {"name": "Nueva"}, format="json")
    assert resp_post.status_code == 405


@pytest.mark.django_db
def test_requires_authentication():
    client = APIClient()
    resp = client.get("/api/inventory/products/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_technician_cannot_write():
    client = _client("technician")
    resp = client.post(
        "/api/inventory/products/", {"sku": "T-1", "name": "X"}, format="json"
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_readonly_cannot_write():
    client = _client("readonly")
    resp = client.post(
        "/api/inventory/products/", {"sku": "R-1", "name": "X"}, format="json"
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_low_stock_ignores_zero_minimum(inv_client):
    # minimum_stock=0 (default) => "sin mínimo configurado" => NO debe aparecer.
    Product.objects.create(sku="LS-3", name="SinMin", stock_quantity=Decimal("0"))
    resp = inv_client.get("/api/inventory/low-stock/")
    names = [p["name"] for p in resp.data]
    assert "SinMin" not in names


@pytest.mark.django_db
def test_adjustment_on_inactive_product_rejected(inv_client):
    p = Product.objects.create(
        sku="INA-1", name="Inactivo", stock_quantity=Decimal("5"), is_active=False
    )
    resp = inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_in", "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 400
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("5")  # intacto
