import pytest
from rest_framework.test import APIClient

from apps.users.models import User

pytestmark = pytest.mark.django_db

CUSTOMERS_URL = "/api/customers/"


def _client_for_role(role):
    user = User.objects.create_user(
        email=f"{role}@test.com", password="x", role=role, full_name="Test User"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_piloto_role_exists():
    assert User.Role.PILOTO == "piloto"
    assert User.Role.PILOTO.label == "Piloto"


def test_piloto_can_create_customer():
    client = _client_for_role("piloto")
    res = client.post(CUSTOMERS_URL, {"name": "Finca del Piloto"}, format="json")
    assert res.status_code == 201, res.content


def test_readonly_still_cannot_create_customer():
    client = _client_for_role("readonly")
    res = client.post(CUSTOMERS_URL, {"name": "X"}, format="json")
    assert res.status_code == 403, res.content
