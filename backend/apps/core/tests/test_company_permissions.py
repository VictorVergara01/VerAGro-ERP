import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


def _client(role):
    u = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.mark.django_db
def test_general_admin_cannot_edit_company():
    resp = _client("general_admin").patch("/api/company/", {"name": "X"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_super_admin_can_edit_company():
    resp = _client("super_admin").patch("/api/company/", {"name": "X"}, format="json")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_anyone_can_read_company():
    resp = _client("technician").get("/api/company/")
    assert resp.status_code == 200
