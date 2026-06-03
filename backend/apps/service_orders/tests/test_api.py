from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def tech_client(db):
    return _client("technician")


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Cliente API")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


@pytest.mark.django_db
def test_create_service_order(tech_client, customer):
    resp = tech_client.post(
        "/api/service-orders/",
        {"customer": customer.id, "service_type": "repair"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["service_order_number"].startswith("OS-")
    assert resp.data["status"] == "received"


@pytest.mark.django_db
def test_status_transitions(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)
    assert (
        tech_client.post(f"/api/service-orders/{o.id}/start-diagnostic/").data["status"]
        == "in_diagnostic"
    )
    assert (
        tech_client.post(f"/api/service-orders/{o.id}/approve/").data["status"]
        == "approved"
    )
    assert (
        tech_client.post(f"/api/service-orders/{o.id}/start-work/").data["status"]
        == "in_progress"
    )


@pytest.mark.django_db
def test_invalid_transition_400(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)  # received
    # No se puede aprobar directamente desde received.
    resp = tech_client.post(f"/api/service-orders/{o.id}/approve/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_add_part_recalculates_total(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer, labor_cost=Decimal("10"))
    p = _product("AP1", sale_price=Decimal("25"), average_cost=Decimal("12"))
    resp = tech_client.post(
        f"/api/service-orders/{o.id}/add-part/",
        {"product": p.id, "quantity": "2"},
        format="json",
    )
    assert resp.status_code == 201
    # unit_price tomado del producto (25) → total piezas 50
    assert Decimal(resp.data["unit_price"]) == Decimal("25.00")
    assert Decimal(resp.data["total_price"]) == Decimal("50.00")
    o.refresh_from_db()
    assert o.total_amount == Decimal("60.00")  # 10 labor + 50 piezas


@pytest.mark.django_db
def test_reserve_and_finish_flow_updates_inventory(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)
    p = _product("RF1", stock_quantity=Decimal("10"), sale_price=Decimal("5"))
    tech_client.post(
        f"/api/service-orders/{o.id}/add-part/",
        {"product": p.id, "quantity": "3"},
        format="json",
    )
    reserve = tech_client.post(f"/api/service-orders/{o.id}/reserve-parts/")
    assert len(reserve.data["reserved"]) == 1
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("3")

    # Pasar a in_progress y finalizar.
    tech_client.post(f"/api/service-orders/{o.id}/start-work/")  # waiting? no pending
    o.refresh_from_db()
    # sin pendientes, sigue en received → start-work no aplica; forzamos transición válida
    if o.status != ServiceOrder.Status.IN_PROGRESS:
        o.status = ServiceOrder.Status.IN_PROGRESS
        o.save()
    finish = tech_client.post(f"/api/service-orders/{o.id}/finish/")
    assert finish.data["status"] == "finished"
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("7")
    assert p.reserved_quantity == Decimal("0")


@pytest.mark.django_db
def test_cancel_releases(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)
    p = _product("CN1", stock_quantity=Decimal("10"))
    tech_client.post(
        f"/api/service-orders/{o.id}/add-part/",
        {"product": p.id, "quantity": "4"},
        format="json",
    )
    tech_client.post(f"/api/service-orders/{o.id}/reserve-parts/")
    resp = tech_client.post(f"/api/service-orders/{o.id}/cancel/")
    assert resp.data["status"] == "cancelled"
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("0")


@pytest.mark.django_db
def test_delete_reserved_part_releases(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)
    p = _product("DR1", stock_quantity=Decimal("10"))
    add = tech_client.post(
        f"/api/service-orders/{o.id}/add-part/",
        {"product": p.id, "quantity": "2"},
        format="json",
    )
    part_id = add.data["id"]
    tech_client.post(f"/api/service-orders/{o.id}/reserve-parts/")
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("2")

    resp = tech_client.delete(f"/api/service-order-parts/{part_id}/")
    assert resp.status_code == 204
    p.refresh_from_db()
    assert p.reserved_quantity == Decimal("0")


@pytest.mark.django_db
def test_filters_and_search(tech_client, customer):
    other = Customer.objects.create(name="Otro")
    ServiceOrder.objects.create(customer=customer)
    ServiceOrder.objects.create(customer=other, status=ServiceOrder.Status.IN_PROGRESS)

    resp = tech_client.get(f"/api/service-orders/?customer={customer.id}")
    assert all(o["customer"] == customer.id for o in resp.data["results"])

    resp = tech_client.get("/api/service-orders/?status=in_progress")
    assert all(o["status"] == "in_progress" for o in resp.data["results"])

    resp = tech_client.get("/api/service-orders/?customer=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_quote_invoice_stubs_501(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)
    assert (
        tech_client.post(f"/api/service-orders/{o.id}/generate-quote/").status_code
        == 501
    )
    assert (
        tech_client.post(f"/api/service-orders/{o.id}/generate-invoice/").status_code
        == 501
    )


@pytest.mark.django_db
def test_permissions(customer, db):
    payload = {"customer": customer.id}
    assert APIClient().post(
        "/api/service-orders/", payload, format="json"
    ).status_code == 401
    for role in ("sales", "readonly", "inventory"):
        assert _client(role).post(
            "/api/service-orders/", payload, format="json"
        ).status_code == 403
    assert _client("technician").post(
        "/api/service-orders/", payload, format="json"
    ).status_code == 201
    assert _client("admin").post(
        "/api/service-orders/", payload, format="json"
    ).status_code == 201


@pytest.mark.django_db
def test_customer_service_orders_history(tech_client, customer):
    ServiceOrder.objects.create(customer=customer)
    ServiceOrder.objects.create(customer=customer)
    resp = tech_client.get(f"/api/customers/{customer.id}/service-orders/")
    assert resp.status_code == 200
    assert resp.data["count"] == 2


@pytest.mark.django_db
def test_equipment_service_history(tech_client, customer):
    etype = EquipmentType.objects.create(name="Dron")
    eq = Equipment.objects.create(
        name="Agras T50", customer=customer, equipment_type=etype
    )
    ServiceOrder.objects.create(customer=customer, equipment=eq)
    resp = tech_client.get(f"/api/equipment/{eq.id}/service-history/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1
