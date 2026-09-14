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


def _login(client, password="secret123", **extra):
    return client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": password},
        format="json",
        **extra,
    )


@pytest.mark.django_db
def test_login_is_throttled_after_too_many_attempts(user):
    client = APIClient()
    for _ in range(10):
        assert _login(client, password="wrong").status_code == 401
    resp = _login(client)
    assert resp.status_code == 429


@pytest.mark.django_db
def test_login_throttle_uses_real_client_ip_behind_cloudflare(user):
    # Tras el túnel todas las peticiones llegan desde la IP de cloudflared: si el
    # límite fuera por REMOTE_ADDR, un atacante bloquearía el login de todos.
    client = APIClient()
    for _ in range(10):
        _login(client, password="wrong", HTTP_CF_CONNECTING_IP="203.0.113.10")
    assert _login(client, HTTP_CF_CONNECTING_IP="203.0.113.10").status_code == 429
    assert _login(client, HTTP_CF_CONNECTING_IP="198.51.100.20").status_code == 200


@pytest.mark.django_db
def test_logout_revokes_refresh_token(user):
    client = APIClient()
    refresh = _login(client).data["refresh"]

    resp = client.post("/api/auth/logout/", {"refresh": refresh}, format="json")
    assert resp.status_code == 200

    resp = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_refresh_does_not_rotate_by_default(user):
    client = APIClient()
    refresh = _login(client).data["refresh"]
    resp = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    assert "refresh" not in resp.data
    # El mismo refresh sigue sirviendo (compatibilidad con el APK ya instalado).
    again = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert again.status_code == 200


@pytest.mark.django_db
def test_refresh_rotation_blacklists_previous_token_when_enabled(user, monkeypatch):
    # simplejwt lee su configuración en un objeto creado al importar: cambiar
    # settings.SIMPLE_JWT en el test no llega al serializer, así que se parchea
    # ese objeto (en producción se toma de JWT_ROTATE_REFRESH_TOKENS al arrancar).
    from rest_framework_simplejwt.serializers import api_settings as jwt_settings

    monkeypatch.setattr(jwt_settings, "ROTATE_REFRESH_TOKENS", True)
    client = APIClient()
    refresh = _login(client).data["refresh"]

    resp = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    assert resp.data["refresh"] != refresh

    reused = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert reused.status_code == 401
