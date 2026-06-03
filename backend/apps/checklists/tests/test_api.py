from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.checklists.models import ChecklistTemplate, ChecklistTemplateItem
from apps.customers.models import Customer
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def admin_client(db):
    return _client("admin")


@pytest.fixture
def tech_client(db):
    return _client("technician")


@pytest.fixture
def order(db):
    customer = Customer.objects.create(name="Cliente API CL")
    return ServiceOrder.objects.create(customer=customer)


def _template():
    t = ChecklistTemplate.objects.create(name="Plantilla API")
    for i in range(1, 4):
        ChecklistTemplateItem.objects.create(template=t, name=f"Item {i}", order=i)
    return t


@pytest.mark.django_db
def test_create_template_admin(admin_client):
    resp = admin_client.post(
        "/api/checklists/templates/",
        {
            "name": "Nueva",
            "items": [{"name": "Punto 1", "order": 1}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert len(resp.data["items"]) == 1


@pytest.mark.django_db
def test_technician_cannot_write_template(tech_client):
    resp = tech_client.post(
        "/api/checklists/templates/", {"name": "X"}, format="json"
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_template_items_filter(admin_client):
    t = _template()
    resp = admin_client.get(f"/api/checklists/template-items/?template={t.id}")
    assert resp.data["count"] == 3
    resp = admin_client.get("/api/checklists/template-items/?template=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_seed_template_listed(tech_client):
    resp = tech_client.get("/api/checklists/templates/?search=Agras")
    names = [t["name"] for t in resp.data["results"]]
    assert "Checklist DJI Agras T50" in names


@pytest.mark.django_db
def test_instantiate_checklist_on_order(tech_client, order):
    t = _template()
    resp = tech_client.post(
        f"/api/service-orders/{order.id}/checklist/",
        {"checklist_template": t.id},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert len(resp.data["items"]) == 3
    assert all(i["status"] == "pending" for i in resp.data["items"])

    # GET lista los checklists de la orden.
    listed = tech_client.get(f"/api/service-orders/{order.id}/checklist/")
    assert len(listed.data) == 1


@pytest.mark.django_db
def test_instantiate_duplicate_400(tech_client, order):
    t = _template()
    tech_client.post(
        f"/api/service-orders/{order.id}/checklist/",
        {"checklist_template": t.id},
        format="json",
    )
    resp = tech_client.post(
        f"/api/service-orders/{order.id}/checklist/",
        {"checklist_template": t.id},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_fill_checklist_adds_recommended_part(tech_client, order):
    t = _template()
    product = Product.objects.create(
        sku="API-RP", name="Pieza", sale_price=Decimal("30")
    )
    inst = tech_client.post(
        f"/api/service-orders/{order.id}/checklist/",
        {"checklist_template": t.id},
        format="json",
    )
    checklist_id = inst.data["id"]
    item_id = inst.data["items"][0]["id"]

    fill = tech_client.post(
        f"/api/service-checklists/{checklist_id}/fill/",
        {
            "items": [
                {
                    "id": item_id,
                    "status": "requires_replacement",
                    "priority": "high",
                    "recommended_product": product.id,
                }
            ]
        },
        format="json",
    )
    assert fill.status_code == 200
    assert fill.data["items"][0]["status"] == "requires_replacement"

    # La pieza recomendada aparece en la orden.
    detail = tech_client.get(f"/api/service-orders/{order.id}/")
    skus = [p["product_sku"] for p in detail.data["parts"]]
    assert "API-RP" in skus


@pytest.mark.django_db
def test_fill_per_item_endpoint(tech_client, order):
    t = _template()
    inst = tech_client.post(
        f"/api/service-orders/{order.id}/checklist/",
        {"checklist_template": t.id},
        format="json",
    )
    item_id = inst.data["items"][0]["id"]
    resp = tech_client.patch(
        f"/api/service-checklist-items/{item_id}/",
        {"status": "ok", "notes": "sin novedad"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "ok"


@pytest.mark.django_db
def test_complete_checklist(tech_client, order):
    t = _template()
    inst = tech_client.post(
        f"/api/service-orders/{order.id}/checklist/",
        {"checklist_template": t.id},
        format="json",
    )
    resp = tech_client.post(
        f"/api/service-checklists/{inst.data['id']}/complete/"
    )
    assert resp.status_code == 200
    assert resp.data["completed_at"] is not None
    assert resp.data["completed_by"] is not None


@pytest.mark.django_db
def test_instantiate_permissions(order, db):
    t = _template()
    payload = {"checklist_template": t.id}
    url = f"/api/service-orders/{order.id}/checklist/"
    assert APIClient().post(url, payload, format="json").status_code == 401
    for role in ("sales", "readonly", "inventory"):
        assert _client(role).post(url, payload, format="json").status_code == 403
