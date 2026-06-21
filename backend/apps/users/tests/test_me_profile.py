import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


def _client():
    user = User.objects.create_user(
        email="t@v.com", password="Str0ngPass!", full_name="Tec", role="technician"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c, user


@pytest.mark.django_db
def test_patch_me_updates_full_name():
    c, user = _client()
    resp = c.patch("/api/auth/me/", {"full_name": "Nuevo Nombre"}, format="json")
    assert resp.status_code == 200, resp.data
    user.refresh_from_db()
    assert user.full_name == "Nuevo Nombre"


@pytest.mark.django_db
def test_patch_me_cannot_change_email_or_role():
    c, user = _client()
    c.patch("/api/auth/me/", {"email": "hacker@v.com", "role": "super_admin"}, format="json")
    user.refresh_from_db()
    assert user.email == "t@v.com"
    assert user.role == "technician"


@pytest.mark.django_db
def test_change_password_wrong_current_returns_400():
    c, user = _client()
    resp = c.post(
        "/api/auth/change-password/",
        {"current_password": "incorrecta", "new_password": "Otr0Pass!9"},
        format="json",
    )
    assert resp.status_code == 400
    assert "current_password" in resp.data


@pytest.mark.django_db
def test_change_password_weak_returns_400():
    c, user = _client()
    resp = c.post(
        "/api/auth/change-password/",
        {"current_password": "Str0ngPass!", "new_password": "123"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_change_password_success():
    c, user = _client()
    resp = c.post(
        "/api/auth/change-password/",
        {"current_password": "Str0ngPass!", "new_password": "Otr0Pass!9"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    user.refresh_from_db()
    assert user.check_password("Otr0Pass!9")
    assert not user.check_password("Str0ngPass!")


@pytest.mark.django_db
def test_change_password_requires_auth():
    resp = APIClient().post(
        "/api/auth/change-password/",
        {"current_password": "x", "new_password": "y"},
        format="json",
    )
    assert resp.status_code == 401
