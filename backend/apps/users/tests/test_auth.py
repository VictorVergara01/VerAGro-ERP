import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="tech@veragro.com", password="secret123", full_name="Tec Uno"
    )


@pytest.mark.django_db
def test_login_returns_tokens(user):
    client = APIClient()
    resp = client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": "secret123"},
        format="json",
    )
    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


@pytest.mark.django_db
def test_me_requires_authentication():
    client = APIClient()
    resp = client.get("/api/auth/me/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_returns_current_user(user):
    client = APIClient()
    login = client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": "secret123"},
        format="json",
    )
    token = login.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/auth/me/")
    assert resp.status_code == 200
    assert resp.data["email"] == "tech@veragro.com"
    assert resp.data["role"] == "technician"


@pytest.mark.django_db
def test_login_rejects_wrong_password(user):
    client = APIClient()
    resp = client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_refresh_returns_new_access(user):
    client = APIClient()
    login = client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": "secret123"},
        format="json",
    )
    refresh = login.data["refresh"]
    resp = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    assert "access" in resp.data
