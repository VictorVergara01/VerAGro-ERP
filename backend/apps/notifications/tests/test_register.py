import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.notifications.models import PushDevice

User = get_user_model()


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _user(email="u@v.com", role="technician"):
    return User.objects.create_user(email=email, password="x", full_name="U", role=role)


@pytest.mark.django_db
def test_register_creates_token():
    user = _user()
    resp = _client(user).post("/api/push/register/", {"token": "ExponentPushToken[abc]"}, format="json")
    assert resp.status_code == 200
    assert PushDevice.objects.filter(user=user, token="ExponentPushToken[abc]").exists()


@pytest.mark.django_db
def test_register_is_idempotent():
    user = _user()
    c = _client(user)
    c.post("/api/push/register/", {"token": "ExponentPushToken[abc]"}, format="json")
    c.post("/api/push/register/", {"token": "ExponentPushToken[abc]"}, format="json")
    assert PushDevice.objects.filter(token="ExponentPushToken[abc]").count() == 1


@pytest.mark.django_db
def test_register_reassigns_token_to_new_user():
    old = _user("old@v.com")
    new = _user("new@v.com")
    _client(old).post("/api/push/register/", {"token": "ExponentPushToken[abc]"}, format="json")
    _client(new).post("/api/push/register/", {"token": "ExponentPushToken[abc]"}, format="json")
    device = PushDevice.objects.get(token="ExponentPushToken[abc]")
    assert device.user == new


@pytest.mark.django_db
def test_unregister_deletes_token():
    user = _user()
    c = _client(user)
    c.post("/api/push/register/", {"token": "ExponentPushToken[abc]"}, format="json")
    resp = c.delete("/api/push/unregister/", {"token": "ExponentPushToken[abc]"}, format="json")
    assert resp.status_code == 204
    assert not PushDevice.objects.filter(token="ExponentPushToken[abc]").exists()


@pytest.mark.django_db
def test_register_requires_auth():
    assert APIClient().post("/api/push/register/", {"token": "x"}, format="json").status_code == 401
