import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer

User = get_user_model()


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(
        email="admin@veragro.com", password="x", full_name="Admin", role="super_admin"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_create_customer(auth_client):
    resp = auth_client.post(
        "/api/customers/",
        {"name": "Agro SA", "customer_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Agro SA"


@pytest.mark.django_db
def test_list_excludes_inactive_by_default(auth_client):
    Customer.objects.create(name="Activo")
    Customer.objects.create(name="Inactivo", is_active=False)
    resp = auth_client.get("/api/customers/")
    names = [c["name"] for c in resp.data["results"]]
    assert "Activo" in names
    assert "Inactivo" not in names


@pytest.mark.django_db
def test_search_by_phone(auth_client):
    Customer.objects.create(name="Uno", phone="6000-1111")
    Customer.objects.create(name="Dos", phone="6000-2222")
    resp = auth_client.get("/api/customers/?search=1111")
    names = [c["name"] for c in resp.data["results"]]
    assert names == ["Uno"]


@pytest.mark.django_db
def test_delete_is_soft(auth_client):
    c = Customer.objects.create(name="Borrar")
    resp = auth_client.delete(f"/api/customers/{c.id}/")
    assert resp.status_code == 204
    c.refresh_from_db()
    assert c.is_active is False


@pytest.mark.django_db
def test_requires_authentication():
    client = APIClient()
    resp = client.get("/api/customers/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_patch_clearing_number_with_existing_type_is_rejected(auth_client):
    c = Customer.objects.create(
        name="Con RUC", identification_type="ruc", identification_number="155-1"
    )
    resp = auth_client.patch(
        f"/api/customers/{c.id}/", {"identification_number": ""}, format="json"
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_setting_type_when_number_already_present_is_allowed(auth_client):
    c = Customer.objects.create(name="Sin tipo", identification_number="155-2")
    resp = auth_client.patch(
        f"/api/customers/{c.id}/", {"identification_type": "ruc"}, format="json"
    )
    assert resp.status_code == 200


@pytest.mark.django_db
def test_include_inactive_shows_inactive(auth_client):
    Customer.objects.create(name="Activo")
    Customer.objects.create(name="Inactivo", is_active=False)
    resp = auth_client.get("/api/customers/?include_inactive=true")
    names = [c["name"] for c in resp.data["results"]]
    assert "Activo" in names
    assert "Inactivo" in names


@pytest.mark.django_db
def test_is_active_not_writable_via_api(auth_client):
    resp = auth_client.post(
        "/api/customers/",
        {"name": "Intento Inactivo", "is_active": False},
        format="json",
    )
    assert resp.status_code == 201
    # is_active es read-only: se ignora el valor enviado y queda activo por defecto.
    assert resp.data["is_active"] is True


@pytest.mark.django_db
def test_readonly_cannot_create_customer(db):
    from rest_framework.test import APIClient
    from django.contrib.auth import get_user_model

    User = get_user_model()
    u = User.objects.create_user(email="ro@v.com", password="x", full_name="RO", role="readonly")
    c = APIClient()
    c.force_authenticate(user=u)
    assert c.post("/api/customers/", {"name": "Nuevo"}, format="json").status_code == 403


@pytest.mark.django_db
def test_general_admin_can_create_customer(db):
    from rest_framework.test import APIClient
    from django.contrib.auth import get_user_model

    User = get_user_model()
    u = User.objects.create_user(email="ga@v.com", password="x", full_name="GA", role="general_admin")
    c = APIClient()
    c.force_authenticate(user=u)
    assert c.post("/api/customers/", {"name": "Nuevo"}, format="json").status_code == 201


@pytest.mark.django_db
def test_history_endpoints_return_empty(auth_client):
    c = Customer.objects.create(name="Con Historial")
    # service-orders ya conectado al módulo: respuesta paginada vacía.
    resp = auth_client.get(f"/api/customers/{c.id}/service-orders/")
    assert resp.status_code == 200
    assert resp.data["count"] == 0
    assert resp.data["results"] == []
    # invoices ya conectado al módulo billing: respuesta paginada vacía.
    resp = auth_client.get(f"/api/customers/{c.id}/invoices/")
    assert resp.status_code == 200
    assert resp.data["count"] == 0
    assert resp.data["results"] == []
    # equipment sigue como placeholder.
    resp = auth_client.get(f"/api/customers/{c.id}/equipment/")
    assert resp.status_code == 200
    assert resp.data == []
