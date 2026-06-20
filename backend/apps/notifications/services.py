import json
import logging
import urllib.request

from django.conf import settings

from .models import PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = getattr(
    settings, "EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send"
)


def users_for_roles(*roles):
    from apps.users.models import User

    return (
        User.objects.filter(is_active=True, role__in=roles, push_devices__isnull=False)
        .distinct()
    )


def _expo_post(messages):
    """POST de los mensajes a Expo; devuelve la lista de tickets (`data`).

    Lanza si hay error de red/HTTP (el llamador lo traga).
    """
    payload = json.dumps(messages).encode("utf-8")
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        body = json.loads(response.read().decode("utf-8"))
    return body.get("data", [])


def send_push(users, title, body, data=None):
    devices = list(PushDevice.objects.filter(user__in=users))
    if not devices:
        return
    messages = [
        {
            "to": device.token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
        }
        for device in devices
    ]
    try:
        tickets = _expo_post(messages)
    except Exception:
        logger.exception("Error enviando notificaciones push a Expo")
        return
    for device, ticket in zip(devices, tickets):
        if (
            ticket.get("status") == "error"
            and ticket.get("details", {}).get("error") == "DeviceNotRegistered"
        ):
            device.delete()
