# Gestión de usuarios en Configuración — Diseño

**Fecha:** 2026-06-13
**Módulo:** users (backend) + settings (frontend web)

## Problema

Hoy la gestión de usuarios (alta, cambio de rol, activar/desactivar) se hace
solo desde el **Django admin**. El usuario quiere administrarla también desde el
panel web, dentro de **Configuración**, conviviendo con el Django admin (no lo
reemplaza).

Estado actual relevante:

- `apps/users/models.py`: `User` (email único, `full_name`, `role` con 7
  valores de `Role`, `is_active`, `is_staff`) + `UserManager.create_user`.
- `apps/users/serializers.py`: `UserSerializer` es casi todo read-only
  (`email`, `role`, `is_active` read-only; solo `full_name` editable). Lo usan
  `/api/auth/me/` y el listado de selección.
- `apps/users/views.py`: `UserListView` (`ListAPIView`, **solo lectura**,
  `IsAuthenticated`, sin paginar, filtro `?role=`, solo `is_active=True`).
  Registrado en `config/urls.py` como `/api/users/`. Lo consumen selectores
  (p. ej. "asignar técnico").
- `apps/core/roles.py`: matriz central de permisos. Grupos `SUPER` y `ADMINS`
  existen; **no** hay grupo de escritura de usuarios todavía.
- `frontend/src/features/settings/`: `SettingsPage` con pestañas Empresa /
  Categorías / Tipos de equipo / Plantillas de checklist; `api.ts` con hooks por
  recurso. `features/auth/roles.ts` ya expone `isAdmin`/`isSuperAdmin` y
  `ROLE_LABELS`.

## Decisiones (acordadas)

1. **Quién gestiona:** ambos administradores (`super_admin` y `general_admin`,
   grupo `ADMINS`).
2. **Quitar usuario:** desactivar (`is_active=False`), reversible. No hay
   borrado físico (el usuario queda referenciado en historial: `created_by` de
   movimientos, técnico de órdenes, `uploaded_by` de fotos, etc.).
3. **Contraseñas:** el admin define una contraseña inicial al crear; al editar,
   un campo opcional la restablece. Sin invitación por correo (no hay SMTP).
4. **Anti-escalada:** solo un `super_admin` puede crear/editar/desactivar a otro
   `super_admin` **o** asignar el rol `super_admin`. Un `general_admin` que lo
   intente recibe 403.

Guardas adicionales (estándar):

- Un admin no puede **desactivarse a sí mismo** ni **cambiar su propio rol**.
- No se puede desactivar ni degradar al **último `super_admin` activo**.
- La contraseña se valida con `validate_password` de Django
  (`AUTH_PASSWORD_VALIDATORS`).
- El email es único (ya en el modelo); intento duplicado → 400.

## Enfoque elegido

**ViewSet de gestión dedicado** en una ruta nueva, separado del selector. Se
descartó convertir el `/api/users/` actual en ModelViewSet (su lectura es
abierta a todo autenticado para alimentar selectores; mezclar ahí la escritura y
la visibilidad de inactivos acoplaría responsabilidades).

## Diseño — Backend (`apps/users/`, `apps/core/roles.py`)

### 1. Grupo de permiso

En `apps/core/roles.py`, añadir:

```python
USERS_WRITE = ADMINS   # gestión de usuarios: ambos administradores
```

### 2. `UserManagementSerializer` (nuevo)

Separado del `UserSerializer` read-only. Campos:
`id, email, full_name, role, is_active, password`.

- `id` read-only.
- `password`: `write_only=True`, `required=False`, `allow_blank=False`,
  `style={'input_type': 'password'}`. Requerido en creación (validado en
  `validate`/`create`); opcional en edición (si viene, restablece; si no, se
  conserva).
- Validaciones:
  - `validate_password(password)` de Django cuando se provee password.
  - Email único lo cubre el `UniqueValidator` que DRF deriva del modelo.
- `create()`: usa `User.objects.create_user(email, password, full_name=..., role=..., is_active=...)`.
- `update()`: actualiza campos; si llega `password`, `instance.set_password(...)`.

Las reglas anti-escalada / auto-bloqueo / último-super NO viven en el
serializer puro (necesitan `request.user` y el contexto de la acción): se
aplican en el ViewSet (ver abajo), que pasa `context={'request': ...}`. Donde
sea natural validar con el request disponible (rol objetivo vs actor) se puede
usar `self.context['request']` dentro del serializer; la decisión de
implementación se fija en el plan. El comportamiento observable (códigos y
mensajes) es el que manda.

### 3. `UserManagementViewSet` (ModelViewSet) → `/api/user-management/`

- Router: `SimpleRouter` (nuevo o el existente del app), prefijo
  `user-management`, registrado en `config/urls.py`. Endpoints:
  `GET/POST /api/user-management/`, `GET/PATCH/DELETE /api/user-management/{id}/`.
- `serializer_class = UserManagementSerializer`.
- `permission_classes = [role_required(*roles.USERS_WRITE)]` (admins, lectura y
  escritura; lectura del listado de gestión también queda admin-only, a
  diferencia del selector `/api/users/`).
- `get_queryset`: todos los usuarios, `order_by("full_name")`. Búsqueda
  `?search=` sobre `email`/`full_name` (DRF `SearchFilter`). Por defecto incluye
  inactivos (es una pantalla de gestión); paginado (paginación por defecto del
  proyecto).
- `destroy()`: **soft** → `is_active=False` + `save(update_fields=["is_active", "updated_at"])`, responde 204. Reactivar = `PATCH {is_active: true}`.
- Reglas (devuelven 403 / 400 con mensaje claro), aplicadas en `perform_create`/
  `perform_update`/`destroy` (o en `validate` con el request en contexto):
  - **Anti-escalada:** si el `request.user` no es `super_admin` y la operación
    crea/edita/desactiva un usuario con rol `super_admin`, o asigna
    `role=super_admin` → **403**.
  - **Auto-bloqueo:** si el objetivo es `request.user` y la operación lo
    desactivaría (`is_active=False`) o cambiaría su `role` → **400**.
  - **Último super_admin:** si la operación desactiva o cambia el rol del único
    `super_admin` activo restante → **400**.

### 4. Tests — `apps/users/tests/test_user_management.py`

Con `APIClient` autenticado por rol (patrón de los demás `test_api.py`):

- Crear usuario (POST con email/nombre/rol/password) → 201; puede iniciar sesión
  con esa password.
- Editar nombre y rol (PATCH) → 200.
- Restablecer password (PATCH con `password`) → 200; login con la nueva.
- PATCH sin `password` no cambia la contraseña existente.
- `DELETE` desactiva (is_active=False, 204); PATCH `is_active=true` reactiva.
- Password débil → 400.
- Email duplicado → 400.
- Rol no admin (p. ej. `sales`) → 403 en list y en write.
- `general_admin` crea/edita/desactiva `super_admin` o asigna `super_admin` → 403.
- `super_admin` sí puede gestionar super_admins → 200/201.
- Auto-desactivarse o auto-cambiarse el rol → 400.
- Desactivar/degradar al último super_admin activo → 400.

## Diseño — Frontend (`frontend/src/features/settings/`)

### 5. Pestaña "Usuarios" en `SettingsPage`

Nueva `Tabs.Tab value="users"` + `Tabs.Panel`, renderizada solo si
`isAdmin(user)` (super o general). El resto de pestañas sin cambios.

### 6. `UsersManager.tsx`

- Tabla (reutiliza `DataTable`): columnas Nombre, Email, Rol (badge con
  `ROLE_LABELS`), Estado (Activo/Inactivo).
- Toolbar: búsqueda (debounce 300 ms, como Clientes) + switch "Incluir
  inactivos" + botón "Nuevo usuario".
- Acciones por fila: editar (abre modal); desactivar (confirm con
  `modals.openConfirmModal`) → `useDeleteUser`. Reactivar desde el modal de
  edición (switch activo) o con un PATCH.

### 7. `UserFormModal.tsx` (`@mantine/form`)

- Campos: email (requerido), nombre completo, select de rol, contraseña, switch
  "Activo".
- El rol `super_admin` aparece en el select **solo** si el usuario actual es
  `super_admin` (`isSuperAdmin`).
- Contraseña: requerida al crear; en edición, placeholder "Dejar vacío para no
  cambiar" y opcional.
- Al guardar, `useSaveUser` (POST si nuevo, PATCH si edita). Errores del backend
  (403/400, p. ej. anti-escalada o password débil) se muestran tal cual en una
  notificación roja.

### 8. Hooks en `settings/api.ts`

- `useUsers({ search, includeInactive })`: `GET /api/user-management/`
  (paginado → devuelve `Paginated<UserAccount>`).
- `useSaveUser`: POST/PATCH a `/api/user-management/` y `/{id}/`.
- `useDeleteUser`: `DELETE /api/user-management/{id}/` (soft).
- Tipos: `UserAccount = Schemas["UserManagement"]` tras regenerar `schema.d.ts`
  (`npm run gen:api`); drf-spectacular nombra el schema según el serializer
  (`UserManagementSerializer` → `UserManagement`). El `password` write-only
  puede requerir cast del body.
- Invalidan `["settings", "users"]`; `useUsers` también puede invalidar
  `["technicians"]`/`["users"]` si se desea reflejar cambios en selectores.

### 9. Tests Vitest

- `UsersManager`/`UserFormModal`: la pestaña aparece solo para admin; el modal
  exige password al crear y la deja opcional al editar; el rol `super_admin` no
  aparece para un `general_admin`.

## Sin migración

No cambia el modelo `User`. El Django admin sigue disponible.

## Fuera de alcance

- Invitación / restablecimiento de contraseña por correo (no hay SMTP).
- Pantalla de gestión de usuarios en la **app móvil** (sigue admin-only de uso
  personal).
- Autoservicio: que un usuario cambie su propia contraseña/datos (esto es
  gestión por admin; el autoservicio sería otro slice).
- Auditoría de cambios (quién modificó a quién) — follow-up de auditoría general.
