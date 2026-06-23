"""Pruebas de permisos de lectura/escritura en /api/field-jobs/.

Cubre la política RoleWriteOrReadOnly(*roles.ADMINS, roles.TECHNICIAN, roles.SALES)
declarada en apps.field_jobs.views.FieldJobWrite.
"""
import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.users.models import User

pytestmark = pytest.mark.django_db

FIELD_JOBS_URL = "/api/field-jobs/"


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca Prueba")


def _client_for_role(role, email=None):
    email = email or f"{role}@test.com"
    user = User.objects.create_user(
        email=email, password="x", role=role, full_name="Test User"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# 1. Anónimo — sin autenticación
# ---------------------------------------------------------------------------

def test_anonymous_get_is_denied():
    """Un cliente sin autenticar recibe 401 en GET /api/field-jobs/."""
    client = APIClient()  # sin force_authenticate
    res = client.get(FIELD_JOBS_URL)
    assert res.status_code == 401, res.content


# ---------------------------------------------------------------------------
# 2. Rol readonly — lectura sí, escritura no
# ---------------------------------------------------------------------------

def test_readonly_can_list(customer):
    """Un usuario readonly puede GET /api/field-jobs/ (200)."""
    client = _client_for_role("readonly")
    res = client.get(FIELD_JOBS_URL)
    assert res.status_code == 200, res.content


def test_readonly_cannot_post(customer):
    """Un usuario readonly recibe 403 al intentar crear un trabajo de campo."""
    client = _client_for_role("readonly")
    res = client.post(FIELD_JOBS_URL, {"customer": customer.id}, format="json")
    assert res.status_code == 403, res.content


# ---------------------------------------------------------------------------
# 3. Rol sales — puede crear
# ---------------------------------------------------------------------------

def test_sales_can_create(customer):
    """Un usuario sales puede crear un trabajo de campo (201)."""
    client = _client_for_role("sales")
    res = client.post(FIELD_JOBS_URL, {"customer": customer.id}, format="json")
    assert res.status_code == 201, res.content


# ---------------------------------------------------------------------------
# 4. Rol technician — puede crear
# ---------------------------------------------------------------------------

def test_technician_can_create(customer):
    """Un usuario technician puede crear un trabajo de campo (201)."""
    client = _client_for_role("technician")
    res = client.post(FIELD_JOBS_URL, {"customer": customer.id}, format="json")
    assert res.status_code == 201, res.content


# ---------------------------------------------------------------------------
# 5. Rol inventory — excluido del grupo de escritura
# ---------------------------------------------------------------------------

def test_inventory_cannot_post(customer):
    """Un usuario inventory recibe 403 al intentar POST (no está en write_roles)."""
    client = _client_for_role("inventory")
    res = client.post(FIELD_JOBS_URL, {"customer": customer.id}, format="json")
    assert res.status_code == 403, res.content
