import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType

User = get_user_model()


@pytest.fixture
def equipment_type(db):
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    return t


@pytest.fixture
def admin_client(db):
    user = User.objects.create_user(
        email="admin@veragro.com", password="x", full_name="Admin", role="admin"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_create_company_equipment(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "Planta 1", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Planta 1"


@pytest.mark.django_db
def test_create_customer_equipment_requires_customer(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "Bomba X", "equipment_type": equipment_type.id, "owner_type": "customer"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_by_serial(admin_client, equipment_type):
    Equipment.objects.create(name="Uno", equipment_type=equipment_type, owner_type="company", serial_number="SER-111")
    Equipment.objects.create(name="Dos", equipment_type=equipment_type, owner_type="company", serial_number="SER-222")
    resp = admin_client.get("/api/equipment/?search=111")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["Uno"]


@pytest.mark.django_db
def test_filter_by_status(admin_client, equipment_type):
    Equipment.objects.create(name="Activo", equipment_type=equipment_type, owner_type="company", status="active")
    Equipment.objects.create(name="Retirado", equipment_type=equipment_type, owner_type="company", status="retired")
    resp = admin_client.get("/api/equipment/?status=retired")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["Retirado"]


@pytest.mark.django_db
def test_filter_by_customer(admin_client, equipment_type):
    c = Customer.objects.create(name="Agro SA")
    Equipment.objects.create(name="DelCliente", equipment_type=equipment_type, owner_type="customer", customer=c)
    Equipment.objects.create(name="DeEmpresa", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.get(f"/api/equipment/?customer={c.id}")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["DelCliente"]


@pytest.mark.django_db
def test_delete_is_soft_sets_retired(admin_client, equipment_type):
    e = Equipment.objects.create(name="Borrar", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.delete(f"/api/equipment/{e.id}/")
    assert resp.status_code == 204
    e.refresh_from_db()
    assert e.status == "retired"


@pytest.mark.django_db
def test_types_endpoint_is_readonly(admin_client, equipment_type):
    resp = admin_client.get("/api/equipment/types/")
    assert resp.status_code == 200
    names = [t["name"] for t in resp.data]
    assert "Bomba" in names
    resp_post = admin_client.post("/api/equipment/types/", {"name": "Nuevo"}, format="json")
    assert resp_post.status_code == 405


@pytest.mark.django_db
def test_service_history_returns_empty(admin_client, equipment_type):
    e = Equipment.objects.create(name="ConHist", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.get(f"/api/equipment/{e.id}/service-history/")
    assert resp.status_code == 200
    assert resp.data == []


@pytest.mark.django_db
def test_requires_authentication(equipment_type):
    client = APIClient()
    resp = client.get("/api/equipment/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_readonly_role_cannot_create(equipment_type):
    user = User.objects.create_user(
        email="ro@veragro.com", password="x", full_name="RO", role="readonly"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/equipment/",
        {"name": "X", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_technician_role_can_create(equipment_type):
    user = User.objects.create_user(
        email="tech@veragro.com", password="x", full_name="T", role="technician"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/equipment/",
        {"name": "X", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
