# Notificaciones Push (Expo) — Diseño

**Fecha:** 2026-06-20
**Estado:** Aprobado por el usuario; listo para plan de implementación.
**Alcance:** Backend (nuevo app `notifications` + hooks en módulos existentes) · App móvil (registro de token + recepción). No toca el frontend web.

---

## 1. Contexto y problema

El ERP no tiene ningún sistema de notificaciones. Los operadores de campo trabajan
desde la app móvil (Expo) y no se enteran en tiempo real de eventos relevantes
(un trabajo recién asignado, una orden completada, stock bajo). Se quiere enviar
**push notifications** a la app móvil.

Estado técnico de partida (verificado):
- `expo-notifications` y `expo-device` **no** están instalados en `mobile/`.
- **Celery está comentado** en `docker-compose.yml` (no hay worker). Redis sí existe.
- No hay modelo de token push ni tabla de notificaciones.
- `User` (`apps/users/models.py`): `email`, `full_name`, `role` (7 roles), `is_active`.

## 2. Decisiones acordadas

1. **Envío síncrono** (sin Celery): cuando ocurre el evento, el backend llama a la
   **Expo Push API** en el mismo request. Justificación: volumen chico; montar Celery
   es sobre-ingeniería. Migrar a async después es acotado (mover `send_push` a una task).
2. **Eventos del MVP** (3): trabajo/orden **asignada al técnico**, **stock bajo mínimo**,
   orden/trabajo **completado**. (Cotización aprobada queda fuera.)
3. **Sin bandeja in-app ni tabla de historial** en el MVP (YAGNI). Solo push.
4. **Tap en la notificación = abre la app** (deep-link a pantalla específica = follow-up).

## 3. Backend — nuevo app `apps/notifications/`

### 3.1 Modelo `PushDevice`

Hereda `TimeStampedModel`.

| Campo | Tipo | Notas |
|---|---|---|
| `user` | FK `users.User`, CASCADE, `related_name="push_devices"` | |
| `token` | `CharField(unique=True)` | Expo push token (`ExponentPushToken[...]`) |

Un usuario puede tener varios dispositivos. Registro = upsert por `token` (si el token
ya existe en otro usuario, se reasigna al usuario actual: el dispositivo cambió de dueño).

### 3.2 `services.py`

```python
# users_for_roles(*roles) -> QuerySet[User]
#   Usuarios activos cuyo role está en `roles` y que tienen al menos un PushDevice.

# send_push(users, title, body, data=None) -> None
#   Reúne los tokens de `users` (distintos), arma mensajes
#   {to, title, body, data, sound:"default"}, y hace UN POST a
#   https://exp.host/--/api/v2/push/send (en lotes de 100 si hiciera falta).
#   Errores de red/HTTP -> se loguean (logging), no se relanza (un fallo de push
#   no debe romper la operación de negocio).
#   En la respuesta, los tickets con status "error" y details.error ==
#   "DeviceNotRegistered" -> se borra ese PushDevice (token muerto).

# Notificadores de alto nivel (los llaman los módulos de dominio):
#   notify_assignment(work, technician)   # work: FieldJob | ServiceOrder
#   notify_low_stock(product)
#   notify_completed(work)                # work: FieldJob | ServiceOrder
# Cada uno construye title/body/data y delega en send_push con los destinatarios.
```

Destinatarios por evento:
- `notify_assignment` → `[technician]` (si tiene dispositivo; si no, no-op).
- `notify_low_stock` → `users_for_roles(SUPER_ADMIN, GENERAL_ADMIN, INVENTORY)`.
- `notify_completed` → `users_for_roles(SUPER_ADMIN, GENERAL_ADMIN)`.

`data` lleva el tipo y el id para el futuro deep-link, p. ej.
`{"type": "field_job", "id": 12}` / `{"type": "service_order", "id": 5}` /
`{"type": "low_stock", "id": 9}`.

### 3.3 Endpoints (`urls.py` registrado en `config/urls.py` como `/api/push/...`)

- `POST /api/push/register/` body `{token}` → upsert `PushDevice(user=request.user, token=...)`. 200.
- `DELETE /api/push/unregister/` body `{token}` → borra ese token. 204.
- Permiso: `IsAuthenticated` (cualquier usuario autenticado registra su propio dispositivo).

### 3.4 Envío a la Expo Push API

POST `https://exp.host/--/api/v2/push/send`, `Content-Type: application/json`, cuerpo
una lista de mensajes. No requiere credenciales del servidor (la Expo push service es
pública para envío). Timeout corto (p. ej. 10 s). La URL base se deja configurable
(`EXPO_PUSH_URL` en settings) para poder mockearla en tests.

## 4. Hooks de eventos en los módulos existentes

Los módulos de dominio importan los notificadores de `apps.notifications.services`
(import perezoso dentro de la función para evitar acoplar imports al cargar, igual que
el patrón de `create_invoice_from_field_job`).

### 4.1 Asignada al técnico

- **FieldJob** (`apps/field_jobs/views.py`): en `perform_create`, si el trabajo nace con
  `technician`, `notify_assignment(job, job.technician)`. En `perform_update`, comparar el
  `technician` previo (capturado de `serializer.instance` antes de guardar) con el nuevo;
  si cambió a un técnico no nulo, notificar.
- **ServiceOrder** (`apps/service_orders/views.py`): misma lógica en `perform_create`/
  `perform_update` con su campo `technician`.

### 4.2 Stock bajo mínimo (solo al cruzar el umbral)

- En el servicio de inventario, en las operaciones que **reducen** stock disponible
  (`consume_stock`, y los ajustes de salida en `apply_adjustment`), comparar
  `available_quantity` **antes** y **después**: si antes era `>= minimum_stock` y después
  es `< minimum_stock` (y `minimum_stock > 0`), `notify_low_stock(product)`. Esto evita
  notificar repetidamente cuando ya estaba bajo mínimo.

### 4.3 Orden/trabajo completado

- `apps/service_orders/services.py::finish_order` → al pasar a `finished`,
  `notify_completed(order)`.
- `apps/field_jobs/services.py::mark_done` → al pasar a `done`, `notify_completed(job)`.

## 5. App móvil

### 5.1 Dependencias y permisos

- `npx expo install expo-notifications expo-device`.
- `app.json`: el plugin/permiso de notificaciones según `expo-notifications` (Android usa
  el canal por defecto; el permiso `POST_NOTIFICATIONS` en Android 13+ lo gestiona la
  librería al pedirlo en runtime).

### 5.2 Registro del token

- Módulo `mobile/src/features/notifications/push.ts`:
  - `registerForPush()`: si es dispositivo físico (`expo-device`), pide permiso
    (`Notifications.requestPermissionsAsync`), obtiene el token
    (`Notifications.getExpoPushTokenAsync({ projectId })` — `projectId` desde
    `expo-constants`), y hace `POST /api/push/register/`. Si el permiso se deniega, no-op.
  - `unregisterPush()`: `DELETE /api/push/unregister/` con el token actual.
- **Cuándo:** `registerForPush()` se llama tras un login exitoso (en `AuthContext`/
  `useAuth` al quedar autenticado). `unregisterPush()` en el logout, antes de borrar
  los tokens de sesión.

### 5.3 Recepción

- `Notifications.setNotificationHandler` para mostrar el aviso en foreground.
- Listener de notificaciones recibidas y de tap (`addNotificationResponseReceivedListener`)
  montado en el árbol autenticado; en el MVP el tap solo trae la app al frente (no navega).

## 6. Deploy (prerrequisito, no es código de esta feature)

- En **Expo Go** el push funciona sin configuración extra.
- En el **APK standalone** (lo que se distribuye desde la web), Android entrega el push a
  través de **FCM**: hay que configurar las credenciales FCM una vez en el proyecto de
  Expo/EAS (Firebase + subir la clave a EAS). Sin esto, el push **no llega** en el APK
  instalado. Documentar en `docs/DEPLOY.md`.

## 7. Tests (pytest, backend)

Sin llamadas de red reales: se mockea la Expo Push API (monkeypatch sobre `requests.post`
o la URL configurable, capturando el payload).

- `test_register_upserts_token` / `test_unregister_deletes_token`.
- `test_register_reassigns_token_to_new_user` (mismo token, otro usuario).
- `test_send_push_builds_messages_and_posts` (payload correcto: `to`/`title`/`body`/`data`).
- `test_send_push_prunes_DeviceNotRegistered` (token muerto se borra).
- `test_send_push_swallows_network_error` (un fallo no relanza).
- `test_users_for_roles_filters_active_with_device`.
- `notify_assignment`: crear FieldJob/ServiceOrder con técnico → notifica a ese técnico;
  cambiar el técnico en update → notifica al nuevo; sin cambio → no notifica.
- `notify_low_stock`: consumo que cruza el umbral → notifica a inventario/admin; consumo
  cuando ya estaba bajo mínimo → no notifica.
- `notify_completed`: `finish_order` y `mark_done` → notifican a admins.

(La app móvil no tiene framework de tests; su gate es `npm run typecheck` + verificación
manual en Expo, como en los módulos anteriores.)

## 8. Fuera de alcance (follow-ups)

- Bandeja de notificaciones in-app + tabla de historial persistente.
- Deep-link al tocar la notificación (abrir la pantalla del trabajo/orden/producto).
- Notificaciones a clientes (no usan la app) o por otros canales (email/WhatsApp).
- Cotización aprobada y otros eventos.
- Migración a envío asíncrono con Celery si el volumen lo exige.
- Preferencias por usuario (silenciar tipos de notificación).
