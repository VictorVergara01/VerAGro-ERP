# Notificaciones Push (Expo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar notificaciones push a la app móvil ante 3 eventos (trabajo/orden asignada al técnico, stock bajo mínimo, orden/trabajo completado), con envío síncrono vía la Expo Push API.

**Architecture:** Nuevo app `backend/apps/notifications/` con `PushDevice` (token por usuario), endpoints de registro, un servicio `send_push` (POST a Expo con `urllib`) y notificadores de alto nivel que difieren el envío con `transaction.on_commit`. Los módulos de dominio (field_jobs, service_orders, inventory) llaman a los notificadores en sus puntos de evento. La app móvil registra su token al login (`expo-notifications`) y recibe los avisos.

**Tech Stack:** Django + DRF; `urllib.request` (stdlib, sin nueva dependencia) para el POST a Expo; pytest. Móvil: Expo SDK 56, `expo-notifications`, `expo-device`, `expo-constants`.

## Global Constraints

- **Envío síncrono, sin Celery.** El notificador difiere el `send_push` con `transaction.on_commit`; nunca se hace red dentro de una transacción abierta.
- **Sin nueva dependencia de Python:** el POST a Expo usa `urllib.request` (stdlib). NO añadir `requests`.
- Expo Push API: `https://exp.host/--/api/v2/push/send` (sin credenciales de servidor). URL configurable vía `settings.EXPO_PUSH_URL` para poder mockear en tests.
- Eventos del MVP: **asignada al técnico**, **stock bajo mínimo** (solo al cruzar el umbral), **completado**. Sin bandeja in-app, sin tabla de historial, tap solo abre la app.
- Destinatarios: asignación → el técnico; stock bajo → `super_admin`/`general_admin`/`inventory`; completado → `super_admin`/`general_admin`.
- `data` de cada push: `{"type": "field_job"|"service_order"|"low_stock", "id": <pk>}` (para deep-link futuro).
- Backend en Docker. Tests: `docker compose exec -T backend pytest <ruta> -v` desde la raíz. Móvil: comandos en el HOST desde `mobile/` (`npm run typecheck`, `npm run gen:api`); el móvil NO tiene tests (gate = typecheck + verificación manual en Expo).
- Tras editar `.py` no hace falta reiniciar para pytest; sí reiniciar (`docker compose restart backend`) antes de un `gen:api` que dependa de endpoints nuevos.

**Spec de referencia:** `docs/superpowers/specs/2026-06-20-notificaciones-push-design.md` (aprobado).

---

### Task 1: App `notifications` + `PushDevice` + endpoints de registro

**Files:**
- Create: `backend/apps/notifications/__init__.py`, `apps.py`, `models.py`, `serializers.py`, `views.py`, `urls.py`, `migrations/__init__.py`, `tests/__init__.py`, `tests/test_register.py`
- Modify: `backend/config/settings/base.py` (LOCAL_APPS)
- Modify: `backend/config/urls.py` (incluir las rutas)

**Interfaces:**
- Produces:
  - `apps.notifications.models.PushDevice` (`user` FK CASCADE `related_name="push_devices"`, `token` unique).
  - Endpoints: `POST /api/push/register/` `{token}` (upsert, 200), `DELETE /api/push/unregister/` `{token}` (204). Permiso `IsAuthenticated`.

- [ ] **Step 1: Scaffold del app**

Crear `backend/apps/notifications/__init__.py`, `migrations/__init__.py`, `tests/__init__.py` vacíos.
Crear `backend/apps/notifications/apps.py`:

```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    verbose_name = "Notificaciones"
```

- [ ] **Step 2: Registrar el app**

En `backend/config/settings/base.py`, en `LOCAL_APPS`, añadir `"apps.notifications",` después de `"apps.reports",`:

```python
    "apps.reports",
    "apps.notifications",
```

- [ ] **Step 3: Modelo `PushDevice`**

Crear `backend/apps/notifications/models.py`:

```python
from django.db import models

from apps.core.models import TimeStampedModel


class PushDevice(TimeStampedModel):
    user = models.ForeignKey(
        "users.User", on_delete=models.CASCADE, related_name="push_devices"
    )
    token = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user_id}:{self.token[:16]}"
```

- [ ] **Step 4: Serializer**

Crear `backend/apps/notifications/serializers.py`:

```python
from rest_framework import serializers


class PushTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)
```

- [ ] **Step 5: Escribir los tests (fallan)**

Crear `backend/apps/notifications/tests/test_register.py`:

```python
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
```

- [ ] **Step 6: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_register.py -v`
Expected: FAIL (no existe la ruta ni el modelo migrado).

- [ ] **Step 7: Views**

Crear `backend/apps/notifications/views.py`:

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PushDevice
from .serializers import PushTokenSerializer


class RegisterPushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]
        # Upsert: el token es único; si ya existe (aunque sea de otro usuario),
        # se reasigna al usuario actual (el dispositivo cambió de dueño).
        PushDevice.objects.update_or_create(token=token, defaults={"user": request.user})
        return Response({"detail": "ok"})

    def delete(self, request):
        serializer = PushTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushDevice.objects.filter(token=serializer.validated_data["token"]).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 8: URLs**

Crear `backend/apps/notifications/urls.py`:

```python
from django.urls import path

from .views import RegisterPushView

urlpatterns = [
    path("push/register/", RegisterPushView.as_view(), name="push-register"),
    path("push/unregister/", RegisterPushView.as_view(), name="push-unregister"),
]
```

En `backend/config/urls.py`, añadir en `urlpatterns` tras `path("api/", include("apps.reports.urls"))`:

```python
    path("api/", include("apps.notifications.urls")),
```

- [ ] **Step 9: Migración**

Run: `docker compose exec -T backend python manage.py makemigrations notifications`
Expected: crea `apps/notifications/migrations/0001_initial.py`.

- [ ] **Step 10: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_register.py -v`
Expected: PASS (5 tests).

- [ ] **Step 11: Commit**

```bash
git add backend/apps/notifications/ backend/config/settings/base.py backend/config/urls.py
git commit -m "feat(notifications): app PushDevice y endpoints de registro de token

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Servicio `send_push` + `users_for_roles`

**Files:**
- Create: `backend/apps/notifications/services.py`
- Create: `backend/apps/notifications/tests/test_send.py`

**Interfaces:**
- Consumes: `PushDevice` (Task 1).
- Produces:
  - `services._expo_post(messages) -> list` — POST a Expo; devuelve la lista `data` de tickets. Lanza en error de red. (Punto de mock en tests.)
  - `services.send_push(users, title, body, data=None) -> None` — reúne tokens, postea, poda tokens `DeviceNotRegistered`, traga errores de red.
  - `services.users_for_roles(*roles) -> QuerySet[User]` — activos, con dispositivo, por rol.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/notifications/tests/test_send.py`:

```python
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_send.py -v`
Expected: FAIL (no existe `services`).

- [ ] **Step 3: Implementar `services.py`**

Crear `backend/apps/notifications/services.py`:

```python
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
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_send.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/tests/test_send.py
git commit -m "feat(notifications): send_push (Expo via urllib) y users_for_roles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Notificadores de alto nivel (con `on_commit`)

**Files:**
- Modify: `backend/apps/notifications/services.py` (añadir notificadores)
- Create: `backend/apps/notifications/tests/test_notifiers.py`

**Interfaces:**
- Consumes: `send_push`, `users_for_roles` (Task 2); `apps.core.roles`.
- Produces:
  - `notify_assignment(work, technician)` — `work` es `FieldJob` o `ServiceOrder`.
  - `notify_low_stock(product)`.
  - `notify_completed(work)`.
  Los tres difieren `send_push` con `transaction.on_commit`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/notifications/tests/test_notifiers.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.inventory.models import Product
from apps.notifications import services
from apps.notifications.models import PushDevice

User = get_user_model()


def _user_with_device(email, role, token):
    u = User.objects.create_user(email=email, password="x", full_name="U", role=role)
    PushDevice.objects.create(user=u, token=token)
    return u


@pytest.mark.django_db
def test_notify_assignment_targets_technician(monkeypatch, django_capture_on_commit_callbacks):
    tech = _user_with_device("t@v.com", "technician", "tok-t")
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"), technician=tech)
    sent = {}
    monkeypatch.setattr(services, "send_push",
                        lambda users, title, body, data=None: sent.update(users=list(users), data=data))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_assignment(job, tech)
    assert sent["users"] == [tech]
    assert sent["data"] == {"type": "field_job", "id": job.pk}


@pytest.mark.django_db
def test_notify_assignment_none_technician_is_noop(monkeypatch, django_capture_on_commit_callbacks):
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    called = {"n": 0}
    monkeypatch.setattr(services, "send_push", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_assignment(job, None)
    assert called["n"] == 0


@pytest.mark.django_db
def test_notify_low_stock_targets_inventory_and_admins(monkeypatch, django_capture_on_commit_callbacks):
    admin = _user_with_device("a@v.com", "general_admin", "tok-a")
    inv = _user_with_device("i@v.com", "inventory", "tok-i")
    _user_with_device("t@v.com", "technician", "tok-t")  # no debe recibir
    product = Product.objects.create(sku="P1", name="Hélice", minimum_stock=5)
    captured = {}
    monkeypatch.setattr(services, "send_push",
                        lambda users, title, body, data=None: captured.update(users=set(users)))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_low_stock(product)
    assert captured["users"] == {admin, inv}


@pytest.mark.django_db
def test_notify_completed_targets_admins(monkeypatch, django_capture_on_commit_callbacks):
    admin = _user_with_device("a@v.com", "super_admin", "tok-a")
    _user_with_device("i@v.com", "inventory", "tok-i")  # no admin -> no recibe
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    captured = {}
    monkeypatch.setattr(services, "send_push",
                        lambda users, title, body, data=None: captured.update(users=set(users)))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_completed(job)
    assert captured["users"] == {admin}
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_notifiers.py -v`
Expected: FAIL (los notificadores no existen).

- [ ] **Step 3: Implementar los notificadores**

Añadir a `backend/apps/notifications/services.py` (import de `transaction` y `roles` al inicio, y las funciones al final):

```python
from django.db import transaction

from apps.core import roles
```

```python
def _schedule(users, title, body, data):
    users = list(users)
    if not users:
        return
    transaction.on_commit(lambda: send_push(users, title, body, data))


def _work_meta(work):
    """(tipo, etiqueta) para FieldJob o ServiceOrder."""
    from apps.field_jobs.models import FieldJob

    if isinstance(work, FieldJob):
        return "field_job", work.number
    return "service_order", work.service_order_number


def notify_assignment(work, technician):
    if technician is None:
        return
    kind, label = _work_meta(work)
    title = "Nuevo trabajo asignado" if kind == "field_job" else "Nueva orden asignada"
    _schedule([technician], title, f"Se te asignó {label}", {"type": kind, "id": work.pk})


def notify_low_stock(product):
    _schedule(
        users_for_roles(roles.SUPER_ADMIN, roles.GENERAL_ADMIN, roles.INVENTORY),
        "Stock bajo mínimo",
        f"{product.name}: {product.available_quantity} disponibles (mínimo {product.minimum_stock})",
        {"type": "low_stock", "id": product.pk},
    )


def notify_completed(work):
    kind, label = _work_meta(work)
    title = "Trabajo completado" if kind == "field_job" else "Orden completada"
    _schedule(
        users_for_roles(roles.SUPER_ADMIN, roles.GENERAL_ADMIN),
        title,
        f"{label} finalizado",
        {"type": kind, "id": work.pk},
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_notifiers.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/tests/test_notifiers.py
git commit -m "feat(notifications): notificadores notify_assignment/low_stock/completed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Hooks de asignación y completado (field_jobs + service_orders)

**Files:**
- Modify: `backend/apps/field_jobs/views.py` (`perform_create`/`perform_update`)
- Modify: `backend/apps/field_jobs/services.py` (`mark_done`)
- Modify: `backend/apps/service_orders/views.py` (`perform_create`/`perform_update`)
- Modify: `backend/apps/service_orders/services.py` (`finish_order`)
- Create: `backend/apps/notifications/tests/test_hooks_work.py`

**Interfaces:**
- Consumes: `notify_assignment`, `notify_completed` (Task 3). Import perezoso dentro de cada función.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/notifications/tests/test_hooks_work.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.notifications import services as notif

User = get_user_model()


@pytest.fixture
def spy_assign(monkeypatch):
    calls = []
    monkeypatch.setattr(notif, "notify_assignment", lambda work, tech: calls.append((work.pk, getattr(tech, "pk", None))))
    return calls


@pytest.fixture
def spy_completed(monkeypatch):
    calls = []
    monkeypatch.setattr(notif, "notify_completed", lambda work: calls.append(work.pk))
    return calls


def _tech():
    return User.objects.create_user(email="t@v.com", password="x", full_name="T", role="technician")


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_create_field_job_with_technician_notifies(spy_assign):
    tech = _tech()
    customer = Customer.objects.create(name="C")
    resp = _client(tech).post(
        "/api/field-jobs/",
        {"customer": customer.id, "job_type": "fumigation", "technician": tech.id},
        format="json",
    )
    assert resp.status_code == 201
    assert spy_assign and spy_assign[-1][1] == tech.id


@pytest.mark.django_db
def test_update_field_job_technician_change_notifies(spy_assign):
    tech = _tech()
    other = User.objects.create_user(email="o@v.com", password="x", full_name="O", role="technician")
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"), technician=tech)
    spy_assign.clear()
    _client(tech).patch(f"/api/field-jobs/{job.id}/", {"technician": other.id}, format="json")
    assert spy_assign and spy_assign[-1][1] == other.id


@pytest.mark.django_db
def test_update_field_job_no_technician_change_does_not_notify(spy_assign):
    tech = _tech()
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"), technician=tech)
    spy_assign.clear()
    _client(tech).patch(f"/api/field-jobs/{job.id}/", {"location": "Lote 5"}, format="json")
    assert spy_assign == []


@pytest.mark.django_db
def test_mark_done_notifies_completed(spy_completed):
    from apps.field_jobs.services import mark_done

    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    mark_done(job)
    assert spy_completed == [job.pk]
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_hooks_work.py -v`
Expected: FAIL (los hooks aún no llaman a los notificadores).

- [ ] **Step 3: Hook de asignación en `field_jobs/views.py`**

En `backend/apps/field_jobs/views.py`, reemplazar `perform_create`/`perform_update` del `FieldJobViewSet`:

```python
    def perform_create(self, serializer):
        job = serializer.save(created_by=self.request.user)
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])
        if job.technician_id:
            from apps.notifications.services import notify_assignment

            notify_assignment(job, job.technician)

    def perform_update(self, serializer):
        previous_tech_id = serializer.instance.technician_id
        job = serializer.save()
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])
        if job.technician_id and job.technician_id != previous_tech_id:
            from apps.notifications.services import notify_assignment

            notify_assignment(job, job.technician)
```

- [ ] **Step 4: Hook de completado en `field_jobs/services.py`**

En `backend/apps/field_jobs/services.py`, en `mark_done`, tras guardar el estado `done` y antes del `return job`:

```python
    job.status = FieldJob.Status.DONE
    job.done_date = timezone.localdate()
    job.save(update_fields=["status", "done_date", "updated_at"])
    from apps.notifications.services import notify_completed

    notify_completed(job)
    return job
```

- [ ] **Step 5: Hook de asignación en `service_orders/views.py`**

En `backend/apps/service_orders/views.py`, reemplazar `perform_create`/`perform_update` del `ServiceOrderViewSet`:

```python
    def perform_create(self, serializer):
        order = serializer.save(created_by=self.request.user)
        recalculate_totals(order)
        if order.technician_id:
            from apps.notifications.services import notify_assignment

            notify_assignment(order, order.technician)

    def perform_update(self, serializer):
        previous_tech_id = serializer.instance.technician_id
        order = serializer.save()
        recalculate_totals(order)
        if order.technician_id and order.technician_id != previous_tech_id:
            from apps.notifications.services import notify_assignment

            notify_assignment(order, order.technician)
```

- [ ] **Step 6: Hook de completado en `service_orders/services.py`**

En `backend/apps/service_orders/services.py`, en `finish_order`, tras `recalculate_totals(order)` y antes de la generación de factura (o antes del `return order`):

```python
    order.status = ServiceOrder.Status.FINISHED
    order.finished_date = timezone.localdate()
    order.save(update_fields=["status", "finished_date", "updated_at"])
    recalculate_totals(order)

    from apps.notifications.services import notify_completed

    notify_completed(order)
```

(Dejar intacto el bloque existente que genera la factura automática a continuación.)

- [ ] **Step 7: Correr los tests del hook y la suite de los módulos**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_hooks_work.py apps/field_jobs apps/service_orders -q`
Expected: PASS, sin regresiones.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/field_jobs/views.py backend/apps/field_jobs/services.py backend/apps/service_orders/views.py backend/apps/service_orders/services.py backend/apps/notifications/tests/test_hooks_work.py
git commit -m "feat(notifications): avisar asignacion y completado (field_jobs + service_orders)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Hook de stock bajo mínimo (al cruzar el umbral)

**Files:**
- Modify: `backend/apps/inventory/services.py` (`consume_stock`, `apply_adjustment`)
- Create: `backend/apps/notifications/tests/test_hooks_stock.py`

**Interfaces:**
- Consumes: `notify_low_stock` (Task 3). Import perezoso.
- Produces: helper local `_notify_if_crossed(product, before_available)` en `inventory/services.py`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/notifications/tests/test_hooks_stock.py`:

```python
import pytest
from decimal import Decimal

from apps.inventory.models import Product
from apps.inventory.services import apply_adjustment, consume_stock
from apps.notifications import services as notif


@pytest.fixture
def spy_low(monkeypatch):
    calls = []
    monkeypatch.setattr(notif, "notify_low_stock", lambda product: calls.append(product.pk))
    return calls


@pytest.mark.django_db
def test_consume_crossing_threshold_notifies(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("10"), minimum_stock=Decimal("5"))
    consume_stock(product=p, quantity=Decimal("6"))  # 10 -> 4, cruza el 5
    assert spy_low == [p.pk]


@pytest.mark.django_db
def test_consume_already_below_does_not_notify(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("4"), minimum_stock=Decimal("5"))
    consume_stock(product=p, quantity=Decimal("1"))  # 4 -> 3, ya estaba bajo
    assert spy_low == []


@pytest.mark.django_db
def test_consume_staying_above_does_not_notify(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("20"), minimum_stock=Decimal("5"))
    consume_stock(product=p, quantity=Decimal("3"))  # 20 -> 17, sigue arriba
    assert spy_low == []


@pytest.mark.django_db
def test_minimum_zero_never_notifies(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("3"), minimum_stock=Decimal("0"))
    consume_stock(product=p, quantity=Decimal("2"))
    assert spy_low == []


@pytest.mark.django_db
def test_adjustment_out_crossing_notifies(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("8"), minimum_stock=Decimal("5"))
    apply_adjustment(product=p, movement_type="adjustment_out", quantity=Decimal("5"))  # 8 -> 3, cruza
    assert spy_low == [p.pk]
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_hooks_stock.py -v`
Expected: FAIL.

- [ ] **Step 3: Helper de cruce en `inventory/services.py`**

En `backend/apps/inventory/services.py`, añadir (junto a los helpers del archivo, p. ej. tras `_q`):

```python
def _notify_if_crossed(product, before_available):
    """Notifica stock bajo solo si esta operación cruzó el umbral hacia abajo."""
    if product.minimum_stock <= 0:
        return
    if before_available >= product.minimum_stock and product.available_quantity < product.minimum_stock:
        from apps.notifications.services import notify_low_stock

        notify_low_stock(product)
```

- [ ] **Step 4: Llamar el helper en `consume_stock`**

En `consume_stock`, capturar el disponible antes de mutar y notificar tras guardar. La función ya hace `locked = Product.objects.select_for_update().get(pk=product.pk)` y luego `locked.stock_quantity -= quantity`. Capturar antes y notificar después del `save`:

```python
    locked = Product.objects.select_for_update().get(pk=product.pk)
    if quantity > locked.stock_quantity:
        raise ValidationError({"quantity": "Stock insuficiente para el consumo."})
    before_available = locked.available_quantity
    locked.stock_quantity = locked.stock_quantity - quantity
```

y tras el `locked.save(...)` de esta función (el que persiste stock/reserva), añadir:

```python
    _notify_if_crossed(locked, before_available)
```

(El `notify_low_stock` difiere el envío con `on_commit`, así que es seguro dentro de la transacción `@transaction.atomic`.)

- [ ] **Step 5: Llamar el helper en `apply_adjustment`**

En `apply_adjustment`, capturar el disponible antes de mutar (tras obtener `locked`) y notificar tras el `save`:

```python
    locked = Product.objects.select_for_update().get(pk=product.pk)
    before_available = locked.available_quantity

    if movement_type == "adjustment_out":
        ...
        locked.stock_quantity = locked.stock_quantity - quantity
    else:  # adjustment_in
        locked.stock_quantity = locked.stock_quantity + quantity

    locked.save(update_fields=["stock_quantity", "updated_at"])
    _notify_if_crossed(locked, before_available)
```

- [ ] **Step 6: Correr los tests del hook y la suite de inventario**

Run: `docker compose exec -T backend pytest apps/notifications/tests/test_hooks_stock.py apps/inventory -q`
Expected: PASS, sin regresiones.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/inventory/services.py backend/apps/notifications/tests/test_hooks_stock.py
git commit -m "feat(notifications): avisar stock bajo minimo al cruzar el umbral

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: App móvil — registro y recepción de push

**Files:**
- Modify: `mobile/package.json` (+ `expo-notifications`, `expo-device` vía `npx expo install`)
- Modify: `mobile/src/lib/api/schema.d.ts` (regenerado)
- Create: `mobile/src/features/notifications/push.ts`
- Modify: `mobile/src/features/auth/AuthContext.tsx` (registrar al login, desregistrar al logout)
- Modify: `mobile/App.tsx` (handler de notificaciones en foreground)

**Interfaces:**
- Consumes: endpoints `/api/push/register/`, `/api/push/unregister/` (Task 1, ya en el schema tras regen).
- Produces: `registerForPush()`, `unregisterPush()`.

- [ ] **Step 1: Instalar dependencias y regenerar el schema**

Run (en `mobile/`): `npx expo install expo-notifications expo-device`
Con el backend reiniciado (`docker compose restart backend`, esperar 200 en `/api/schema/`), correr (en `mobile/`): `npm run gen:api`.
Verificar: `grep -c "push/register" src/lib/api/schema.d.ts` ≥ 1.

- [ ] **Step 2: Implementar `push.ts`**

Crear `mobile/src/features/notifications/push.ts`:

```ts
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "../../lib/api/client";

let currentToken: string | null = null;

export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return; // los emuladores no entregan push
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    currentToken = tokenResponse.data;
    await api.POST("/api/push/register/", { body: { token: currentToken } as never });
  } catch {
    // El push es best-effort; un fallo no debe romper la sesión.
  }
}

export async function unregisterPush(): Promise<void> {
  if (!currentToken) return;
  try {
    await api.DELETE("/api/push/unregister/", { body: { token: currentToken } as never });
  } catch {
    // ignorar
  } finally {
    currentToken = null;
  }
}
```

- [ ] **Step 3: Wire en `AuthContext.tsx`**

En `mobile/src/features/auth/AuthContext.tsx`:
1. Import: `import { registerForPush, unregisterPush } from "../notifications/push";`
2. En `loadMe`, tras `setStatus("authenticated")` (cuando hay usuario), añadir `void registerForPush();`.
3. En `logout`, antes de `await clearTokens();`, añadir `await unregisterPush();`.

- [ ] **Step 4: Handler de foreground en `App.tsx`**

En `mobile/App.tsx`, fuera del componente (a nivel de módulo), configurar el handler de notificaciones para mostrarlas con la app abierta:

```tsx
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

(Si la versión de `expo-notifications` usa la API anterior `shouldShowAlert`, usar la forma que el typecheck acepte — ajustar a la firma real de `NotificationBehavior` sin cambiar la intención: mostrar el aviso en foreground.)

- [ ] **Step 5: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 6: Verificación manual (Expo)**

Levantar Expo (`npx expo start`) y, en un **dispositivo físico** con Expo Go (los emuladores no entregan push): iniciar sesión → confirmar que se registró el token (en el panel/DB: `PushDevice` con el token del usuario). Disparar un evento (p. ej. asignarse un trabajo de campo, o que un admin marque uno como hecho) y confirmar que llega el aviso. Capturar cualquier problema. (Nota: el push real en el APK standalone requiere FCM configurado en EAS — fuera de alcance de esta tarea.)

- [ ] **Step 7: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/lib/api/schema.d.ts mobile/src/features/notifications/push.ts mobile/src/features/auth/AuthContext.tsx mobile/App.tsx
git commit -m "feat(notifications movil): registro de token Expo y recepcion en foreground

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 → 2 → 3 → 4 → 5 → 6. La 6 (móvil) necesita los endpoints de la 1 desplegados para el `gen:api`.
- **`on_commit` en tests:** los hooks de Task 4/5 se prueban mockeando los notificadores (`notify_*`) y, donde se ejercita el notificador real (Task 3), se usa `django_capture_on_commit_callbacks(execute=True)` (fixture de pytest-django) para que corran las callbacks de `on_commit`.
- **Reinicio del backend** antes del `gen:api` (Task 6) para que el schema incluya `/api/push/...`.
- **Deploy (no es código de este plan):** configurar credenciales FCM en EAS para que el push llegue en el APK standalone; documentar en `docs/DEPLOY.md`.
- **Fuera de alcance (follow-ups):** bandeja in-app + historial persistente, deep-link al tocar, cotización aprobada, migración a Celery, preferencias por usuario.
