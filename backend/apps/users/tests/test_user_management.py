import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()
URL = "/api/user-management/"


def _make(role="super_admin", email=None, **extra):
    return User.objects.create_user(
        email=email or f"{role}@v.com",
        password="Str0ngPass!",
        full_name=role.title(),
        role=role,
        **extra,
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_create_user_returns_201_and_can_login():
    c = _client(_make("super_admin"))
    resp = c.post(
        URL,
        {"email": "nuevo@v.com", "full_name": "Nuevo", "role": "technician",
         "is_active": True, "password": "Str0ngPass!"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert "password" not in resp.data
    created = User.objects.get(email="nuevo@v.com")
    assert created.check_password("Str0ngPass!")


@pytest.mark.django_db
def test_patch_updates_name_and_role():
    c = _client(_make("super_admin"))
    target = _make("technician", email="t@v.com")
    resp = c.patch(f"{URL}{target.id}/", {"full_name": "Renombrado", "role": "sales"}, format="json")
    assert resp.status_code == 200, resp.data
    target.refresh_from_db()
    assert target.full_name == "Renombrado"
    assert target.role == "sales"


@pytest.mark.django_db
def test_patch_with_password_resets_it():
    c = _client(_make("super_admin"))
    target = _make("technician", email="t@v.com")
    resp = c.patch(f"{URL}{target.id}/", {"password": "Otr0Pass!9"}, format="json")
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.check_password("Otr0Pass!9")


@pytest.mark.django_db
def test_patch_without_password_keeps_it():
    c = _client(_make("super_admin"))
    target = _make("technician", email="t@v.com")
    c.patch(f"{URL}{target.id}/", {"full_name": "X"}, format="json")
    target.refresh_from_db()
    assert target.check_password("Str0ngPass!")


@pytest.mark.django_db
def test_delete_soft_deactivates_and_patch_reactivates():
    c = _client(_make("super_admin"))
    target = _make("technician", email="t@v.com")
    resp = c.delete(f"{URL}{target.id}/")
    assert resp.status_code == 204
    target.refresh_from_db()
    assert target.is_active is False
    resp = c.patch(f"{URL}{target.id}/", {"is_active": True}, format="json")
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.is_active is True


@pytest.mark.django_db
def test_weak_password_returns_400():
    c = _client(_make("super_admin"))
    resp = c.post(
        URL,
        {"email": "x@v.com", "full_name": "X", "role": "technician", "password": "123"},
        format="json",
    )
    assert resp.status_code == 400
    assert "password" in resp.data


@pytest.mark.django_db
def test_duplicate_email_returns_400():
    c = _client(_make("super_admin"))
    _make("technician", email="dup@v.com")
    resp = c.post(
        URL,
        {"email": "dup@v.com", "full_name": "X", "role": "technician", "password": "Str0ngPass!"},
        format="json",
    )
    assert resp.status_code == 400
    assert "email" in resp.data


@pytest.mark.django_db
def test_create_without_password_returns_400():
    c = _client(_make("super_admin"))
    resp = c.post(
        URL,
        {"email": "x@v.com", "full_name": "X", "role": "technician"},
        format="json",
    )
    assert resp.status_code == 400
    assert "password" in resp.data


@pytest.mark.django_db
def test_non_admin_role_forbidden_on_list_and_write():
    c = _client(_make("sales"))
    assert c.get(URL).status_code == 403
    resp = c.post(
        URL,
        {"email": "x@v.com", "full_name": "X", "role": "technician", "password": "Str0ngPass!"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_list_includes_inactive_by_default():
    c = _client(_make("super_admin"))
    _make("technician", email="off@v.com", is_active=False)
    resp = c.get(URL)
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.data["results"]]
    assert "off@v.com" in emails
