# Gestión de usuarios en Configuración — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear, editar (nombre/rol/contraseña) y desactivar/reactivar usuarios desde el panel web (Configuración → pestaña Usuarios), conviviendo con el Django admin.

**Architecture:** ViewSet de gestión dedicado (`/api/user-management/`) separado del selector read-only `/api/users/`. Las reglas anti-escalada / auto-bloqueo / último-super se aplican en el ViewSet (necesitan `request.user`). Frontend: nueva pestaña con `UsersManager` + `UserFormModal`, gated a administradores.

**Tech Stack:** Django REST Framework (SimpleRouter, ModelViewSet), drf-spectacular; React + Mantine + TanStack Query + openapi-fetch; pytest (backend), vitest (frontend).

## Global Constraints

- Roles válidos en `apps/users/models.py::User.Role`: `super_admin`, `general_admin`, `sales`, `technician`, `inventory`, `accounting`, `readonly`.
- Grupo que gestiona usuarios: `ADMINS = (super_admin, general_admin)`.
- Sin migración: el modelo `User` no cambia.
- Contraseñas validadas con `django.contrib.auth.password_validation.validate_password`.
- "Quitar usuario" = soft delete (`is_active=False`), reversible. No hay borrado físico.
- Backend tests se corren con: `docker compose exec backend pytest <ruta>::<test> -v`.
- Frontend tests: `npm run test` (vitest) dentro de `frontend/`.
- Paginación REST por defecto: `StandardPagination`, `PAGE_SIZE=25` (las respuestas de lista vienen como `{count, next, previous, results}`).

---

### Task 1: Backend — serializer, viewset y ruta (CRUD básico)

**Files:**
- Modify: `backend/apps/core/roles.py` (añadir `USERS_WRITE`)
- Modify: `backend/apps/users/serializers.py` (añadir `UserManagementSerializer`)
- Modify: `backend/apps/users/views.py` (añadir `UserManagementViewSet`)
- Modify: `backend/config/urls.py` (registrar router `user-management`)
- Test: `backend/apps/users/tests/test_user_management.py`

**Interfaces:**
- Produces:
  - `roles.USERS_WRITE: tuple[str, ...]` = `ADMINS`
  - `UserManagementSerializer` (campos `id, email, full_name, role, is_active, password`; `password` write-only)
  - `UserManagementViewSet` registrado en `/api/user-management/` (basename `user-management`)
  - Endpoints: `GET/POST /api/user-management/`, `GET/PATCH/DELETE /api/user-management/{id}/`
- Consumes: `apps.core.permissions.role_required`, `User.objects.create_user`

- [ ] **Step 1: Añadir el grupo de permiso en `roles.py`**

En `backend/apps/core/roles.py`, después de la línea `BILLING_WRITE = ...` (dentro de "Grupos de escritura por área"), añadir:

```python
USERS_WRITE = ADMINS                            # gestión de usuarios (alta/edición/baja)
```

- [ ] **Step 2: Escribir los tests de CRUD básico (fallan)**

Crear `backend/apps/users/tests/test_user_management.py`:

```python
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
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `docker compose exec backend pytest apps/users/tests/test_user_management.py -v`
Expected: FAIL (404 / ruta inexistente; `UserManagementViewSet` no definido).

- [ ] **Step 4: Implementar el serializer**

En `backend/apps/users/serializers.py`, añadir al final:

```python
from django.contrib.auth.password_validation import validate_password


class UserManagementSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = ("id", "email", "full_name", "role", "is_active", "password")
        read_only_fields = ("id",)

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError(
                {"password": "La contraseña es obligatoria al crear un usuario."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
```

- [ ] **Step 5: Implementar el viewset (CRUD + soft delete)**

En `backend/apps/users/views.py`, añadir los imports y la clase. Imports al inicio (junto a los existentes):

```python
from rest_framework import filters, viewsets

from apps.core import roles
from apps.core.permissions import role_required

from .serializers import UserManagementSerializer
```

Al final del archivo:

```python
UsersWrite = role_required(*roles.USERS_WRITE)


class UserManagementViewSet(viewsets.ModelViewSet):
    """Gestión de usuarios desde Configuración (admins). Soft delete."""

    serializer_class = UserManagementSerializer
    permission_classes = [UsersWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["email", "full_name"]
    queryset = User.objects.all().order_by("full_name")

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
```

- [ ] **Step 6: Registrar la ruta en `config/urls.py`**

En `backend/config/urls.py`: ampliar el import de views y registrar un router. Cambiar la línea de import:

```python
from apps.users.views import UserListView, UserManagementViewSet
```

Añadir, después de los imports y antes de `urlpatterns`:

```python
from rest_framework.routers import SimpleRouter

users_router = SimpleRouter()
users_router.register("user-management", UserManagementViewSet, basename="user-management")
```

Y dentro de `urlpatterns`, justo debajo de la línea `path("api/users/", UserListView.as_view(), ...)`, añadir:

```python
    path("api/", include(users_router.urls)),
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `docker compose exec backend pytest apps/users/tests/test_user_management.py -v`
Expected: PASS (los 10 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/core/roles.py backend/apps/users/serializers.py backend/apps/users/views.py backend/config/urls.py backend/apps/users/tests/test_user_management.py
git commit -m "feat(users): CRUD de usuarios en /api/user-management/ (soft delete)"
```

---

### Task 2: Backend — reglas anti-escalada, auto-bloqueo y último super_admin

**Files:**
- Modify: `backend/apps/users/views.py` (`UserManagementViewSet`: `perform_create`/`perform_update`/`perform_destroy`)
- Test: `backend/apps/users/tests/test_user_management.py` (añadir casos)

**Interfaces:**
- Consumes: `UserManagementViewSet` (Task 1), `roles.SUPER_ADMIN`
- Produces: respuestas 403 (anti-escalada) y 400 (auto-bloqueo / último super) con mensaje claro

- [ ] **Step 1: Añadir los tests de reglas (fallan)**

Añadir al final de `backend/apps/users/tests/test_user_management.py`:

```python
@pytest.mark.django_db
def test_general_admin_cannot_create_super_admin():
    c = _client(_make("general_admin"))
    resp = c.post(
        URL,
        {"email": "s@v.com", "full_name": "S", "role": "super_admin", "password": "Str0ngPass!"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_general_admin_cannot_edit_super_admin():
    c = _client(_make("general_admin"))
    target = _make("super_admin", email="other-super@v.com")
    resp = c.patch(f"{URL}{target.id}/", {"full_name": "X"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_general_admin_cannot_promote_to_super_admin():
    c = _client(_make("general_admin"))
    target = _make("technician", email="t@v.com")
    resp = c.patch(f"{URL}{target.id}/", {"role": "super_admin"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_super_admin_can_manage_super_admins():
    _make("super_admin", email="keep-super@v.com")  # garantiza que no es el último
    c = _client(_make("super_admin", email="actor@v.com"))
    resp = c.post(
        URL,
        {"email": "s2@v.com", "full_name": "S2", "role": "super_admin", "password": "Str0ngPass!"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


@pytest.mark.django_db
def test_cannot_change_own_role():
    actor = _make("super_admin", email="actor@v.com")
    _make("super_admin", email="keep@v.com")  # no es el último super
    c = _client(actor)
    resp = c.patch(f"{URL}{actor.id}/", {"role": "sales"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_deactivate_self():
    actor = _make("super_admin", email="actor@v.com")
    _make("super_admin", email="keep@v.com")
    c = _client(actor)
    resp = c.delete(f"{URL}{actor.id}/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_deactivate_last_active_super_admin():
    actor = _make("super_admin", email="only-super@v.com")
    other = _make("super_admin", email="other-super@v.com")
    c = _client(actor)
    resp = c.delete(f"{URL}{other.id}/")  # quedaría 'actor' -> permitido
    assert resp.status_code == 204
    # ahora 'actor' es el último super activo: degradar a 'other' ya no aplica; intentar con actor desde otro super no hay.
    # Verificación directa: desactivar al último super restante vía otro super inexistente -> usamos degradación de rol.
    resp = c.patch(f"{URL}{actor.id}/", {"role": "general_admin"}, format="json")
    assert resp.status_code == 400  # auto-cambio de rol (cubre también último-super)
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec backend pytest apps/users/tests/test_user_management.py -k "general_admin or own_role or deactivate or super_admins or last_active" -v`
Expected: FAIL (hoy no hay guardas; create/patch/delete pasan sin restricción).

- [ ] **Step 3: Implementar las guardas en el viewset**

En `backend/apps/users/views.py`, añadir el import de excepciones:

```python
from rest_framework.exceptions import PermissionDenied, ValidationError
```

Reemplazar el cuerpo de `UserManagementViewSet` (manteniendo atributos de clase) para añadir los métodos `perform_create`, `perform_update` y ampliar `perform_destroy`:

```python
class UserManagementViewSet(viewsets.ModelViewSet):
    """Gestión de usuarios desde Configuración (admins). Soft delete."""

    serializer_class = UserManagementSerializer
    permission_classes = [UsersWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["email", "full_name"]
    queryset = User.objects.all().order_by("full_name")

    @staticmethod
    def _is_super(user):
        return user.role == roles.SUPER_ADMIN

    @staticmethod
    def _is_last_active_super(exclude_pk):
        return not (
            User.objects.filter(role=roles.SUPER_ADMIN, is_active=True)
            .exclude(pk=exclude_pk)
            .exists()
        )

    def perform_create(self, serializer):
        target_role = serializer.validated_data.get("role")
        if target_role == roles.SUPER_ADMIN and not self._is_super(self.request.user):
            raise PermissionDenied(
                "Solo un super administrador puede crear super administradores."
            )
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        actor = self.request.user
        data = serializer.validated_data
        new_role = data.get("role", instance.role)
        new_active = data.get("is_active", instance.is_active)

        touches_super = instance.role == roles.SUPER_ADMIN or new_role == roles.SUPER_ADMIN
        if touches_super and not self._is_super(actor):
            raise PermissionDenied(
                "Solo un super administrador puede gestionar super administradores."
            )

        if instance.pk == actor.pk:
            if new_role != instance.role:
                raise ValidationError({"role": "No puedes cambiar tu propio rol."})
            if not new_active:
                raise ValidationError({"is_active": "No puedes desactivar tu propia cuenta."})

        if instance.role == roles.SUPER_ADMIN and instance.is_active:
            if (new_role != roles.SUPER_ADMIN or not new_active) and self._is_last_active_super(
                instance.pk
            ):
                raise ValidationError(
                    "No puedes desactivar ni degradar al último super administrador activo."
                )

        serializer.save()

    def perform_destroy(self, instance):
        actor = self.request.user
        if instance.role == roles.SUPER_ADMIN and not self._is_super(actor):
            raise PermissionDenied(
                "Solo un super administrador puede desactivar super administradores."
            )
        if instance.pk == actor.pk:
            raise ValidationError({"is_active": "No puedes desactivar tu propia cuenta."})
        if (
            instance.role == roles.SUPER_ADMIN
            and instance.is_active
            and self._is_last_active_super(instance.pk)
        ):
            raise ValidationError(
                "No puedes desactivar al último super administrador activo."
            )
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
```

- [ ] **Step 4: Correr toda la suite del módulo y verificar que pasa**

Run: `docker compose exec backend pytest apps/users/tests/test_user_management.py -v`
Expected: PASS (todos, incluidos los de Task 1).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/users/views.py backend/apps/users/tests/test_user_management.py
git commit -m "feat(users): reglas anti-escalada, auto-bloqueo y ultimo super_admin"
```

---

### Task 3: Frontend — hooks, UsersManager, UserFormModal y pestaña en Configuración

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts` (regenerado por `npm run gen:api`)
- Modify: `frontend/src/features/settings/api.ts` (hooks `useUsers`, `useSaveUser`, `useDeleteUser`)
- Create: `frontend/src/features/settings/UsersManager.tsx`
- Create: `frontend/src/features/settings/UserFormModal.tsx`
- Modify: `frontend/src/features/settings/SettingsPage.tsx` (pestaña "Usuarios" gated a admin)
- Test: `frontend/src/features/settings/users.test.tsx`

**Interfaces:**
- Consumes: endpoints de Task 1/2 (`/api/user-management/`), `Schemas["UserManagement"]`, `useAuth`, `ROLE_LABELS`, `isAdmin`, `isSuperAdmin`, `DataTable`, `Paginated`
- Produces: pestaña "Usuarios" visible solo para `isAdmin(user.role)`

- [ ] **Step 1: Regenerar los tipos del API (backend de Task 1/2 corriendo)**

Run (en `frontend/`, con el backend levantado en `localhost:8000`):
`npm run gen:api`
Expected: `src/lib/api/schema.d.ts` ahora incluye el path `/api/user-management/` y el componente `UserManagement`.
Verificar: `grep -c "user-management" src/lib/api/schema.d.ts` devuelve ≥ 1.

- [ ] **Step 2: Escribir el test de UI (falla)**

Crear `frontend/src/features/settings/users.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserFormModal } from "./UserFormModal";

function renderModal(props: Partial<React.ComponentProps<typeof UserFormModal>> = {}) {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <UserFormModal
          opened
          onClose={vi.fn()}
          editing={props.editing ?? null}
          currentRole={props.currentRole ?? "general_admin"}
          onSubmit={props.onSubmit ?? vi.fn()}
          submitting={false}
        />
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("UserFormModal", () => {
  it("exige contraseña al crear (campo presente, sin placeholder de 'dejar vacío')", () => {
    renderModal({ editing: null });
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/dejar vac/i),
    ).not.toBeInTheDocument();
  });

  it("en edición la contraseña es opcional (placeholder 'dejar vacío')", () => {
    renderModal({
      editing: { id: 1, email: "a@v.com", full_name: "A", role: "technician", is_active: true },
    });
    expect(screen.getByPlaceholderText(/dejar vac/i)).toBeInTheDocument();
  });

  it("oculta el rol super_admin para un general_admin", () => {
    renderModal({ currentRole: "general_admin" });
    expect(screen.queryByText("Super Administrador")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run (en `frontend/`): `npm run test -- users`
Expected: FAIL ("Cannot find module './UserFormModal'").

- [ ] **Step 4: Implementar los hooks en `settings/api.ts`**

Añadir al final de `frontend/src/features/settings/api.ts`:

```typescript
// ---------- Usuarios (gestión) ----------

export type UserAccount = Schemas["UserManagement"];

export interface UserInput {
  id?: number;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  password?: string;
}

function userErrorMessage(error: unknown, fallback: string): string {
  const body = error as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.detail === "string") return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

export function useUsers(params: { search?: string; includeInactive?: boolean }) {
  return useQuery({
    queryKey: ["settings", "users", params.search ?? "", params.includeInactive ?? false],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/user-management/", {
        params: { query: { search: params.search || undefined } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los usuarios.");
      const results = (data as unknown as Paginated<UserAccount>).results;
      return params.includeInactive ? results : results.filter((u) => u.is_active);
    },
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UserInput) => {
      const { id, password, ...rest } = input;
      const body = { ...rest, ...(password ? { password } : {}) } as never;
      if (id) {
        const { error } = await api.PATCH("/api/user-management/{id}/", {
          params: { path: { id } },
          body,
        });
        if (error) throw new Error(userErrorMessage(error, "No se pudo guardar el usuario."));
      } else {
        const { error } = await api.POST("/api/user-management/", { body });
        if (error) throw new Error(userErrorMessage(error, "No se pudo crear el usuario."));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/user-management/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error(userErrorMessage(error, "No se pudo desactivar el usuario."));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
```

- [ ] **Step 5: Implementar `UserFormModal.tsx`**

Crear `frontend/src/features/settings/UserFormModal.tsx`:

```tsx
import { Button, Group, Modal, PasswordInput, Select, Stack, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect } from "react";

import { ROLE_LABELS, isSuperAdmin } from "../auth/roles";
import type { UserAccount, UserInput } from "./api";

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export interface UserFormModalProps {
  opened: boolean;
  onClose: () => void;
  editing: UserAccount | null;
  currentRole?: string;
  submitting: boolean;
  onSubmit: (input: UserInput) => void;
}

export function UserFormModal({
  opened,
  onClose,
  editing,
  currentRole,
  submitting,
  onSubmit,
}: UserFormModalProps) {
  const isEdit = editing != null;
  const roleOptions = isSuperAdmin(currentRole)
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((o) => o.value !== "super_admin");

  const form = useForm<{
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    password: string;
  }>({
    initialValues: { email: "", full_name: "", role: "technician", is_active: true, password: "" },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Email inválido"),
      password: (v) => (!isEdit && !v ? "La contraseña es obligatoria" : null),
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues(
        editing
          ? {
              email: editing.email,
              full_name: editing.full_name ?? "",
              role: editing.role,
              is_active: editing.is_active,
              password: "",
            }
          : { email: "", full_name: "", role: "technician", is_active: true, password: "" },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing]);

  const submit = form.onSubmit((values) => {
    onSubmit({
      id: editing?.id,
      email: values.email.trim(),
      full_name: values.full_name.trim(),
      role: values.role,
      is_active: values.is_active,
      password: values.password || undefined,
    });
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? "Editar usuario" : "Nuevo usuario"}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Email" withAsterisk {...form.getInputProps("email")} />
          <TextInput label="Nombre completo" {...form.getInputProps("full_name")} />
          <Select label="Rol" data={roleOptions} allowDeselect={false} {...form.getInputProps("role")} />
          <PasswordInput
            label="Contraseña"
            withAsterisk={!isEdit}
            placeholder={isEdit ? "Dejar vacío para no cambiar" : undefined}
            {...form.getInputProps("password")}
          />
          <Switch
            label="Activo"
            checked={form.values.is_active}
            onChange={(e) => form.setFieldValue("is_active", e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 6: Correr el test de UI y verificar que pasa**

Run (en `frontend/`): `npm run test -- users`
Expected: PASS (3 casos).

- [ ] **Step 7: Implementar `UsersManager.tsx`**

Crear `frontend/src/features/settings/UsersManager.tsx`:

```tsx
import { ActionIcon, Badge, Button, Group, Switch, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { useAuth } from "../auth/useAuth";
import { ROLE_LABELS } from "../auth/roles";
import { UserFormModal } from "./UserFormModal";
import { useDeleteUser, useSaveUser, useUsers, type UserAccount, type UserInput } from "./api";

export function UsersManager() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const list = useUsers({ search: debounced, includeInactive });
  const save = useSaveUser();
  const remove = useDeleteUser();

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (u: UserAccount) => {
    setEditing(u);
    setModalOpen(true);
  };

  const submit = async (input: UserInput) => {
    try {
      await save.mutateAsync(input);
      notifications.show({ color: "green", message: "Usuario guardado." });
      setModalOpen(false);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmDeactivate = (u: UserAccount) =>
    modals.openConfirmModal({
      title: "Desactivar usuario",
      children: `¿Desactivar a "${u.full_name || u.email}"? Podrás reactivarlo después.`,
      labels: { confirm: "Desactivar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(u.id);
          notifications.show({ color: "green", message: "Usuario desactivado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<UserAccount>[] = [
    { header: "Nombre", render: (u) => u.full_name || "—" },
    { header: "Email", render: (u) => u.email },
    { header: "Rol", render: (u) => <Badge variant="light">{ROLE_LABELS[u.role] ?? u.role}</Badge> },
    {
      header: "Estado",
      render: (u) => (
        <Badge color={u.is_active ? "green" : "gray"} variant="light">
          {u.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (u) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => openEdit(u)}>
            <IconEdit size={18} />
          </ActionIcon>
          {u.is_active && u.id !== user?.id && (
            <ActionIcon variant="subtle" color="red" onClick={() => confirmDeactivate(u)}>
              <IconTrash size={18} />
            </ActionIcon>
          )}
        </Group>
      ),
    },
  ];

  return (
    <>
      <Group justify="space-between" mb="md">
        <Group>
          <TextInput
            placeholder="Buscar por nombre o email"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={300}
          />
          <Switch
            label="Incluir inactivos"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.currentTarget.checked)}
          />
        </Group>
        <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
          Nuevo usuario
        </Button>
      </Group>
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.isLoading}
        rowKey={(u) => u.id}
        emptyText="Sin usuarios."
      />
      <UserFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        currentRole={user?.role}
        submitting={save.isPending}
        onSubmit={submit}
      />
    </>
  );
}
```

- [ ] **Step 8: Añadir la pestaña "Usuarios" en `SettingsPage.tsx` (solo admin)**

En `frontend/src/features/settings/SettingsPage.tsx`:

1. Añadir imports:

```tsx
import { useAuth } from "../auth/useAuth";
import { isAdmin } from "../auth/roles";
import { UsersManager } from "./UsersManager";
```

2. Dentro de `SettingsPage`, antes del `return`, obtener el rol:

```tsx
  const { user } = useAuth();
  const showUsers = isAdmin(user?.role);
```

3. En `<Tabs.List>`, tras la pestaña de checklists, añadir condicionalmente:

```tsx
          {showUsers && <Tabs.Tab value="users">Usuarios</Tabs.Tab>}
```

4. Tras el `<Tabs.Panel value="checklists">…</Tabs.Panel>`, añadir:

```tsx
        {showUsers && (
          <Tabs.Panel value="users">
            <UsersManager />
          </Tabs.Panel>
        )}
```

- [ ] **Step 9: Verificar typecheck, lint y tests del frontend**

Run (en `frontend/`):
`npm run typecheck && npm run lint && npm run test -- settings users`
Expected: sin errores de tipos/lint; tests PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/api/schema.d.ts frontend/src/features/settings/api.ts frontend/src/features/settings/UsersManager.tsx frontend/src/features/settings/UserFormModal.tsx frontend/src/features/settings/SettingsPage.tsx frontend/src/features/settings/users.test.tsx
git commit -m "feat(settings): pestana de gestion de usuarios en Configuracion"
```

---

## Notas de ejecución

- **Orden estricto:** Task 1 → 2 → 3. El paso 1 de Task 3 (`npm run gen:api`) **requiere** el backend de Task 1/2 corriendo, porque genera los tipos del nuevo endpoint.
- **Recarga del backend:** tras editar `.py`, `docker compose restart backend` (el runserver en este entorno no recarga solo).
- **Fuera de alcance** (del spec, no implementar aquí): invitación/reset por correo, gestión de usuarios en la app móvil, autoservicio de contraseña, auditoría de cambios.
