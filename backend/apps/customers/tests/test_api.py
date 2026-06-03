import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer

User = get_user_model()


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(
        email="admin@veragro.com", password="x", full_name="Admin", role="admin"
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
