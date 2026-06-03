from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.suppliers.models import Supplier

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


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Proveedor API")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


def _create_order_payload(supplier, p1, p2):
    return {
        "supplier": supplier.id,
        "shipping_cost": "60",
        "lines": [
            {"product": p1.id, "quantity_ordered": "10", "unit_purchase_cost": "18"},
            {"product": p2.id, "quantity_ordered": "1", "unit_purchase_cost": "120"},
        ],
        "additional_costs": [{"name": "Aduana", "amount": "40"}],
    }


@pytest.mark.django_db
def test_create_order_with_nested_computes_costs(inv_client, supplier):
    p1, p2 = _product("A1"), _product("A2")
    resp = inv_client.post(
        "/api/purchase-orders/",
        _create_order_payload(supplier, p1, p2),
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["order_number"].startswith("OC-")
    assert resp.data["status"] == "draft"
    assert Decimal(resp.data["subtotal_products"]) == Decimal("300.00")
    # shipping 60 + adicional 40 = 100 distribuido por valor (180/300 vs 120/300).
    assert Decimal(resp.data["grand_total"]) == Decimal("400.00")
    lines = resp.data["lines"]
    assert len(lines) == 2


@pytest.mark.django_db
def test_recalculate_action(inv_client, supplier):
    order = PurchaseOrder.objects.create(supplier=supplier)
    p = _product("RC1")
    PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=2, unit_purchase_cost=50
    )
    resp = inv_client.post(f"/api/purchase-orders/{order.id}/recalculate/")
    assert resp.status_code == 200
    assert Decimal(resp.data["subtotal_products"]) == Decimal("100.00")


@pytest.mark.django_db
def test_send_receive_all_flow(inv_client, supplier):
    p1, p2 = _product("F1"), _product("F2")
    create = inv_client.post(
        "/api/purchase-orders/",
        _create_order_payload(supplier, p1, p2),
        format="json",
    )
    order_id = create.data["id"]

    send = inv_client.post(f"/api/purchase-orders/{order_id}/send/")
    assert send.data["status"] == "sent"

    receive = inv_client.post(
        f"/api/purchase-orders/{order_id}/receive/",
        {"receive_all": True},
        format="json",
    )
    assert receive.data["status"] == "received"
    p1.refresh_from_db()
    assert p1.stock_quantity == Decimal("10.00")


@pytest.mark.django_db
def test_receive_partial_via_receipts(inv_client, supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT
    )
    p = _product("PP1")
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=10, unit_purchase_cost=5
    )
    resp = inv_client.post(
        f"/api/purchase-orders/{order.id}/receive/",
        {"receipts": [{"line": line.id, "quantity": 4}]},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "partially_received"


@pytest.mark.django_db
def test_cancel_order(inv_client, supplier):
    order = PurchaseOrder.objects.create(supplier=supplier)
    resp = inv_client.post(f"/api/purchase-orders/{order.id}/cancel/")
    assert resp.data["status"] == "cancelled"


@pytest.mark.django_db
def test_edit_line_recalculates_order(inv_client, supplier):
    order = PurchaseOrder.objects.create(supplier=supplier)
    p = _product("EL1")
    resp = inv_client.post(
        "/api/purchase-order-lines/",
        {
            "purchase_order": order.id,
            "product": p.id,
            "quantity_ordered": "3",
            "unit_purchase_cost": "10",
        },
        format="json",
    )
    assert resp.status_code == 201
    order.refresh_from_db()
    assert order.subtotal_products == Decimal("30.00")


@pytest.mark.django_db
def test_edit_blocked_after_received(inv_client, supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.RECEIVED
    )
    resp = inv_client.patch(
        f"/api/purchase-orders/{order.id}/",
        {"notes": "cambio"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_filter_by_supplier_and_status(inv_client, supplier):
    other = Supplier.objects.create(name="Otro")
    PurchaseOrder.objects.create(supplier=supplier)
    PurchaseOrder.objects.create(supplier=other, status=PurchaseOrder.Status.SENT)

    resp = inv_client.get(f"/api/purchase-orders/?supplier={supplier.id}")
    assert all(o["supplier"] == supplier.id for o in resp.data["results"])

    resp = inv_client.get("/api/purchase-orders/?status=sent")
    assert all(o["status"] == "sent" for o in resp.data["results"])


@pytest.mark.django_db
def test_filter_supplier_non_numeric_400(inv_client):
    resp = inv_client.get("/api/purchase-orders/?supplier=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_by_order_number(inv_client, supplier):
    o = PurchaseOrder.objects.create(supplier=supplier, order_number="OC-ZZZ")
    resp = inv_client.get("/api/purchase-orders/?search=ZZZ")
    numbers = [x["order_number"] for x in resp.data["results"]]
    assert "OC-ZZZ" in numbers


@pytest.mark.django_db
def test_permissions(supplier, db):
    p = _product("PERM1")
    payload = {
        "supplier": supplier.id,
        "lines": [
            {"product": p.id, "quantity_ordered": "1", "unit_purchase_cost": "10"}
        ],
    }
    # Sin auth
    assert APIClient().post(
        "/api/purchase-orders/", payload, format="json"
    ).status_code == 401
    # technician no escribe
    assert _client("technician").post(
        "/api/purchase-orders/", payload, format="json"
    ).status_code == 403
    # readonly no escribe
    assert _client("readonly").post(
        "/api/purchase-orders/", payload, format="json"
    ).status_code == 403
    # inventory sí
    assert _client("inventory").post(
        "/api/purchase-orders/", payload, format="json"
    ).status_code == 201


@pytest.mark.django_db
def test_supplier_purchase_history(inv_client, supplier):
    PurchaseOrder.objects.create(supplier=supplier)
    PurchaseOrder.objects.create(supplier=supplier)
    resp = inv_client.get(f"/api/suppliers/{supplier.id}/purchase-history/")
    assert resp.status_code == 200
    assert resp.data["count"] == 2
