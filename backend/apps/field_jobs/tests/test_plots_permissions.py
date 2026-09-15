"""Permisos de /api/field-plots/: RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)."""
import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldPlot
from apps.users.models import User

pytestmark = pytest.mark.django_db

PLOTS_URL = "/api/field-plots/"


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca La Esperanza")


def _client_for_role(role):
    user = User.objects.create_user(
        email=f"{role}@test.com", password="x", role=role, full_name="Test User"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_anonimo_recibe_401():
    assert APIClient().get(PLOTS_URL).status_code == 401


def test_readonly_lee_pero_no_escribe(customer):
    client = _client_for_role("readonly")
    assert client.get(PLOTS_URL).status_code == 200
    res = client.post(PLOTS_URL, {"customer": customer.id, "name": "X"}, format="json")
    assert res.status_code == 403


def test_piloto_crea_lotes(customer):
    client = _client_for_role("piloto")
    res = client.post(
        PLOTS_URL, {"customer": customer.id, "name": "Potrero 1"}, format="json"
    )
    assert res.status_code == 201, res.content


def test_piloto_ve_lotes_de_cualquier_cliente(customer):
    """A diferencia de los trabajos, los lotes no se filtran por piloto asignado."""
    otro = Customer.objects.create(name="Finca Santa Rita")
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    FieldPlot.objects.create(customer=otro, name="Potrero 2")
    body = _client_for_role("piloto").get(PLOTS_URL).json()
    assert len(body) == 2
