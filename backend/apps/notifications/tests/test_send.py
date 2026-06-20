import pytest
from django.contrib.auth import get_user_model

from apps.notifications import services
from apps.notifications.models import PushDevice

User = get_user_model()


def _user_with_device(email, role, token):
    u = User.objects.create_user(email=email, password="x", full_name="U", role=role)
    PushDevice.objects.create(user=u, token=token)
    return u


@pytest.mark.django_db
def test_users_for_roles_filters_active_with_device():
    admin = _user_with_device("a@v.com", "general_admin", "tok-a")
    inv = _user_with_device("i@v.com", "inventory", "tok-i")
    # sales sin dispositivo: no debe aparecer
    User.objects.create_user(email="s@v.com", password="x", full_name="S", role="sales")
    result = set(services.users_for_roles("general_admin", "inventory"))
    assert result == {admin, inv}


@pytest.mark.django_db
def test_send_push_builds_messages_and_posts(monkeypatch):
    user = _user_with_device("u@v.com", "technician", "ExponentPushToken[x]")
    captured = {}

    def fake_post(messages):
        captured["messages"] = messages
        return [{"status": "ok"}]

    monkeypatch.setattr(services, "_expo_post", fake_post)
    services.send_push([user], "Hola", "Cuerpo", {"type": "field_job", "id": 3})
    assert captured["messages"] == [
        {"to": "ExponentPushToken[x]", "title": "Hola", "body": "Cuerpo",
         "data": {"type": "field_job", "id": 3}, "sound": "default"}
    ]


@pytest.mark.django_db
def test_send_push_prunes_device_not_registered(monkeypatch):
    user = _user_with_device("u@v.com", "technician", "ExponentPushToken[dead]")
    monkeypatch.setattr(
        services, "_expo_post",
        lambda messages: [{"status": "error", "details": {"error": "DeviceNotRegistered"}}],
    )
    services.send_push([user], "t", "b")
    assert not PushDevice.objects.filter(token="ExponentPushToken[dead]").exists()


@pytest.mark.django_db
def test_send_push_swallows_network_error(monkeypatch):
    user = _user_with_device("u@v.com", "technician", "ExponentPushToken[x]")

    def boom(messages):
        raise OSError("network down")

    monkeypatch.setattr(services, "_expo_post", boom)
    # No debe relanzar.
    services.send_push([user], "t", "b")


@pytest.mark.django_db
def test_send_push_no_devices_is_noop(monkeypatch):
    user = User.objects.create_user(email="u@v.com", password="x", full_name="U", role="technician")
    called = {"n": 0}
    monkeypatch.setattr(services, "_expo_post", lambda m: called.__setitem__("n", called["n"] + 1) or [])
    services.send_push([user], "t", "b")
    assert called["n"] == 0
