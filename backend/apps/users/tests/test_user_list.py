import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


def _client(role="super_admin"):
    user = User.objects.create_user(
        email=f"{role}@v.com", password="x", full_name=role.title(), role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_user_list_requires_auth():
    assert APIClient().get("/api/users/").status_code == 401


@pytest.mark.django_db
def test_user_list_returns_active_users():
    c = _client("super_admin")
    User.objects.create_user(
        email="t1@v.com", password="x", full_name="Tec Uno", role="technician"
    )
    User.objects.create_user(
        email="inactivo@v.com", password="x", full_name="Inactivo", role="technician",
        is_active=False,
    )
    resp = c.get("/api/users/")
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.data]  # respuesta es lista (sin paginar)
    assert "t1@v.com" in emails
    assert "inactivo@v.com" not in emails


@pytest.mark.django_db
def test_user_list_filter_by_role():
    c = _client("super_admin")
    User.objects.create_user(
        email="tech1@v.com", password="x", full_name="Tec", role="technician"
    )
    User.objects.create_user(
        email="sales1@v.com", password="x", full_name="Vendedor", role="sales"
    )
    resp = c.get("/api/users/?role=technician")
    roles = {u["role"] for u in resp.data}
    assert roles == {"technician"}
