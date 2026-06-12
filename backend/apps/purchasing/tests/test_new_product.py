import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import Product, ProductCategory
from apps.suppliers.models import Supplier

User = get_user_model()


def _client():
    user = User.objects.create_user(
        email="inv@veragro.com", password="x", full_name="i", role="inventory"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_create_po_with_new_product():
    supplier = Supplier.objects.create(name="Prov")
    cat = ProductCategory.objects.create(name="Cat")
    payload = {
        "supplier": supplier.id,
        "lines": [
            {
                "new_product": {"name": "Filtro nuevo", "category": cat.id},
                "quantity_ordered": "4",
                "unit_purchase_cost": "12",
            },
        ],
    }
    resp = _client().post("/api/purchase-orders/", payload, format="json")
    assert resp.status_code == 201, resp.content
    assert Product.objects.filter(name="Filtro nuevo").exists()
    product = Product.objects.get(name="Filtro nuevo")
    assert product.stock_quantity == 0
    assert product.sku == f"SKU-{product.pk:06d}"  # autogenerado, formato compartido
    assert resp.data["lines"][0]["product"] == product.id


@pytest.mark.django_db
def test_create_po_line_requires_product_or_new_product():
    supplier = Supplier.objects.create(name="Prov")
    payload = {
        "supplier": supplier.id,
        "lines": [{"quantity_ordered": "1", "unit_purchase_cost": "1"}],
    }
    resp = _client().post("/api/purchase-orders/", payload, format="json")
    assert resp.status_code == 400


def _draft_order(client, supplier):
    resp = client.post(
        "/api/purchase-orders/", {"supplier": supplier.id}, format="json"
    )
    assert resp.status_code == 201, resp.content
    return resp.data["id"]


@pytest.mark.django_db
def test_add_line_with_existing_product_to_order():
    client = _client()
    supplier = Supplier.objects.create(name="Prov")
    product = Product.objects.create(name="Boquilla", sku="BQ-1")
    order_id = _draft_order(client, supplier)
    resp = client.post(
        "/api/purchase-order-lines/",
        {
            "purchase_order": order_id,
            "product": product.id,
            "quantity_ordered": "3",
            "unit_purchase_cost": "10",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    detail = client.get(f"/api/purchase-orders/{order_id}/").data
    assert detail["subtotal_products"] == "30.00"


@pytest.mark.django_db
def test_add_line_with_new_product_to_order():
    client = _client()
    supplier = Supplier.objects.create(name="Prov")
    cat = ProductCategory.objects.create(name="Cat")
    order_id = _draft_order(client, supplier)
    resp = client.post(
        "/api/purchase-order-lines/",
        {
            "purchase_order": order_id,
            "new_product": {"name": "Sensor nuevo", "category": cat.id},
            "quantity_ordered": "2",
            "unit_purchase_cost": "25",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    product = Product.objects.get(name="Sensor nuevo")
    assert product.stock_quantity == 0
    assert resp.data["product"] == product.id


@pytest.mark.django_db
def test_edit_line_quantity_and_cost_recalculates():
    client = _client()
    supplier = Supplier.objects.create(name="Prov")
    product = Product.objects.create(name="Boquilla", sku="BQ-2")
    order_id = _draft_order(client, supplier)
    line_id = client.post(
        "/api/purchase-order-lines/",
        {
            "purchase_order": order_id,
            "product": product.id,
            "quantity_ordered": "1",
            "unit_purchase_cost": "10",
        },
        format="json",
    ).data["id"]
    resp = client.patch(
        f"/api/purchase-order-lines/{line_id}/",
        {"quantity_ordered": "5", "unit_purchase_cost": "20"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    detail = client.get(f"/api/purchase-orders/{order_id}/").data
    assert detail["subtotal_products"] == "100.00"
