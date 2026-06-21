# Perfil y cambio de contraseña en móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el usuario de la app móvil vea su perfil, edite su nombre y cambie su contraseña (autoservicio).

**Architecture:** Backend: `MeView` pasa a `RetrieveUpdateAPIView` (PATCH del nombre; email/rol ya read-only en `UserSerializer`) + nuevo `ChangePasswordView` (`POST /api/auth/change-password/`). Móvil: nueva feature `features/profile/` (hooks + `ProfileScreen`), un ítem "Mi perfil" en el menú Más, y un `refreshUser()` expuesto por `AuthContext` para reflejar el nombre actualizado en toda la app.

**Tech Stack:** Django + DRF + drf-spectacular; pytest. Móvil: React Native/Expo, TanStack Query, openapi-fetch; UI propia (`components/ui`).

## Global Constraints

- Email y rol son **solo lectura** para el autoservicio (los gestiona admin). El `UserSerializer` ya tiene `read_only_fields = ("id", "email", "role", "is_active")`.
- Cambio de contraseña: verificar la **actual** (`check_password`) → 400 si es incorrecta; validar la **nueva** con `django.contrib.auth.password_validation.validate_password` → 400 si es débil. El JWT vigente NO se invalida (la sesión sigue activa).
- Backend en Docker. Tests: `docker compose exec -T backend pytest <ruta> -v` desde la raíz. Reiniciar (`docker compose restart backend`) antes del `gen:api` móvil (Task 2) para que el schema incluya PATCH `/me/` y `change-password/`.
- Móvil: comandos en el HOST desde `mobile/` (`npm run typecheck`, `npm run gen:api`). El móvil NO tiene tests → gate = typecheck + verificación manual en Expo.
- Rutas backend bajo `/api/auth/` (el `users/urls.py` se incluye con ese prefijo).

**Spec de referencia:** `docs/superpowers/specs/2026-06-21-perfil-password-movil-design.md` (aprobado).

---

### Task 1: Backend — editar nombre propio + cambiar contraseña

**Files:**
- Modify: `backend/apps/users/serializers.py` (añadir `ChangePasswordSerializer`)
- Modify: `backend/apps/users/views.py` (`MeView` → RetrieveUpdate; añadir `ChangePasswordView`)
- Modify: `backend/apps/users/urls.py` (ruta `change-password/`)
- Test: `backend/apps/users/tests/test_me_profile.py`

**Interfaces:**
- Produces:
  - `PATCH /api/auth/me/ {full_name}` → 200 (email/rol read-only, no cambian).
  - `POST /api/auth/change-password/ {current_password, new_password}` → 200 `{"detail": ...}`; 400 si la actual es incorrecta o la nueva es débil; 401 sin auth.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/users/tests/test_me_profile.py`:

```python
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/users/tests/test_me_profile.py -v`
Expected: FAIL (PATCH /me/ no permitido (405) y change-password 404).

- [ ] **Step 3: Añadir `ChangePasswordSerializer`**

En `backend/apps/users/serializers.py`, añadir al final:

```python
class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
```

- [ ] **Step 4: Modificar `views.py`**

En `backend/apps/users/views.py`:

1. Ampliar imports (al inicio):

```python
from django.contrib.auth.password_validation import validate_password
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView
```

2. Cambiar `MeView` de `RetrieveAPIView` a `RetrieveUpdateAPIView`:

```python
class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
```

3. Ampliar el import del serializer y añadir `ChangePasswordView`. En la línea de import de serializers, incluir `ChangePasswordSerializer`:

```python
from .serializers import ChangePasswordSerializer, UserManagementSerializer, UserSerializer
```

Y añadir la vista (p. ej. tras `MeView`):

```python
class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            raise ValidationError(
                {"current_password": "La contraseña actual no es correcta."}
            )
        new_password = serializer.validated_data["new_password"]
        validate_password(new_password, user=user)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Contraseña actualizada."})
```

(`ValidationError` ya está importado en este archivo: `from rest_framework.exceptions import PermissionDenied, ValidationError`.)

- [ ] **Step 5: Añadir la ruta**

En `backend/apps/users/urls.py`, ampliar el import y añadir la ruta:

```python
from .views import ChangePasswordView, MeView
```

```python
    path("me/", MeView.as_view(), name="auth-me"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/users/tests/test_me_profile.py -v`
Expected: PASS (6 tests).

- [ ] **Step 7: Verificar que no se rompió users/auth**

Run: `docker compose exec -T backend pytest apps/users -q`
Expected: toda la suite de users en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/users/serializers.py backend/apps/users/views.py backend/apps/users/urls.py backend/apps/users/tests/test_me_profile.py
git commit -m "feat(users): editar nombre propio (PATCH /me/) y cambiar contrasena

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Móvil — `refreshUser` en AuthContext + hooks de perfil + schema

**Files:**
- Modify: `mobile/src/lib/api/schema.d.ts` (regenerado)
- Modify: `mobile/src/features/auth/AuthContext.tsx` (exponer `refreshUser`)
- Create: `mobile/src/features/profile/api.ts`

**Interfaces:**
- Consumes: endpoints de Task 1 (PATCH `/me/`, `change-password/`), ya en el schema tras regen.
- Produces:
  - `AuthContextValue.refreshUser: () => Promise<void>` (re-ejecuta `loadMe`).
  - `useUpdateName()` → `PATCH /api/auth/me/ {full_name}`.
  - `useChangePassword()` → `POST /api/auth/change-password/ {current_password, new_password}` (extrae el mensaje del backend en error).

- [ ] **Step 1: Regenerar el schema del móvil**

Con el backend reiniciado (`docker compose restart backend`, esperar 200 en `/api/schema/`), correr (en `mobile/`): `npm run gen:api`.
Verificar: `grep -c "change-password" src/lib/api/schema.d.ts` ≥ 1.

- [ ] **Step 2: Exponer `refreshUser` en `AuthContext.tsx`**

En `mobile/src/features/auth/AuthContext.tsx`:
1. En la interface `AuthContextValue`, añadir:

```ts
  refreshUser: () => Promise<void>;
```

2. En el `useMemo` del value, añadir `refreshUser: loadMe`:

```tsx
  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, refreshUser: loadMe }),
    [user, status, login, logout, loadMe],
  );
```

- [ ] **Step 3: Crear `profile/api.ts`**

Crear `mobile/src/features/profile/api.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

import { api } from "../../lib/api/client";

export function useUpdateName() {
  return useMutation({
    mutationFn: async (full_name: string) => {
      const { error } = await api.PATCH("/api/auth/me/", {
        body: { full_name } as never,
      });
      if (error) throw new Error("No se pudo actualizar el nombre.");
    },
  });
}

function changePasswordError(error: unknown, fallback: string): string {
  const body = error as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.detail === "string") return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { current_password: string; new_password: string }) => {
      const { error } = await api.POST("/api/auth/change-password/", {
        body: input as never,
      });
      if (error) throw new Error(changePasswordError(error, "No se pudo cambiar la contraseña."));
    },
  });
}
```

- [ ] **Step 4: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/api/schema.d.ts mobile/src/features/auth/AuthContext.tsx mobile/src/features/profile/api.ts
git commit -m "feat(profile movil): refreshUser en AuthContext y hooks de perfil

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Móvil — `ProfileScreen` + navegación + ítem de menú

**Files:**
- Create: `mobile/src/features/profile/ProfileScreen.tsx`
- Modify: `mobile/src/navigation/types.ts` (`Profile` en `MoreStackParamList`)
- Modify: `mobile/src/navigation/MainTabs.tsx` (registrar `Profile` en `MoreNavigator`)
- Modify: `mobile/src/features/menu/MenuScreen.tsx` (ítem "Mi perfil")

**Interfaces:**
- Consumes: `useUpdateName`, `useChangePassword` (Task 2); `useAuth` (con `refreshUser`); `ROLE_LABELS` (`../auth/roles`); UI `Card`, `LabeledInput`, `Button`, `SectionTitle`.
- Produces: ruta `Profile` (título "Mi perfil") en el stack de la pestaña Más.

- [ ] **Step 1: Añadir la ruta a los tipos de navegación**

En `mobile/src/navigation/types.ts`, en `MoreStackParamList`, añadir `Profile: undefined;` (junto a las demás entradas del stack):

```ts
export type MoreStackParamList = {
  Menu: undefined;
  Profile: undefined;
  // ...resto sin cambios
```

- [ ] **Step 2: Implementar `ProfileScreen.tsx`**

Crear `mobile/src/features/profile/ProfileScreen.tsx`:

```tsx
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";

import { Button, Card, LabeledInput, SectionTitle } from "../../components/ui";
import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { ROLE_LABELS } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { useChangePassword, useUpdateName } from "./api";

export function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user, refreshUser } = useAuth();
  const updateName = useUpdateName();
  const changePassword = useChangePassword();

  const [name, setName] = useState(user?.full_name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const saveName = () => {
    if (!name.trim()) return Alert.alert("Falta el nombre", "Escribe tu nombre.");
    updateName.mutate(name.trim(), {
      onSuccess: async () => {
        await refreshUser();
        Alert.alert("Listo", "Perfil actualizado.");
      },
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  const submitPassword = () => {
    if (!current || !next) return Alert.alert("Faltan datos", "Completa ambas contraseñas.");
    changePassword.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          Alert.alert("Listo", "Contraseña actualizada.");
        },
        onError: (e) => Alert.alert("Error", (e as Error).message),
      },
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Rol</Text>
        <Text style={styles.value}>{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</Text>
      </Card>

      <SectionTitle>Datos</SectionTitle>
      <Card>
        <LabeledInput label="Nombre completo" value={name} onChangeText={setName} />
        <Button title="Guardar" onPress={saveName} loading={updateName.isPending} style={{ marginTop: 12 }} />
      </Card>

      <SectionTitle>Cambiar contraseña</SectionTitle>
      <Card>
        <LabeledInput label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry />
        <LabeledInput label="Nueva contraseña" value={next} onChangeText={setNext} secureTextEntry />
        <Button title="Cambiar" onPress={submitPassword} loading={changePassword.isPending} style={{ marginTop: 12 }} />
      </Card>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    label: { fontSize: 12, fontWeight: "700", color: colors.dimmed },
    value: { fontSize: 15, color: colors.text, marginTop: 2 },
  });
```

(Firmas verificadas: `Button = { title, onPress, loading?, style?, ... }`; `LabeledInput = TextInputProps & { label }` (acepta `secureTextEntry`); `Card`/`SectionTitle` reciben `children`.)

- [ ] **Step 3: Registrar la pantalla en `MainTabs.tsx`**

En `mobile/src/navigation/MainTabs.tsx`:
1. Import: `import { ProfileScreen } from "../features/profile/ProfileScreen";`
2. En `MoreNavigator`, añadir el screen (p. ej. tras el de `Menu`):

```tsx
      <MoreStack.Screen name="Profile" component={ProfileScreen} options={{ title: "Mi perfil" }} />
```

- [ ] **Step 4: Añadir el ítem "Mi perfil" al menú**

En `mobile/src/features/menu/MenuScreen.tsx`, en el grupo `"General"` (junto a Reportes/Configuración), añadir:

```tsx
        { label: "Mi perfil", icon: "person", color: colors.primary, onPress: () => nav.navigate("Profile") },
```

(El icono `"person"` es de Ionicons; el tipo de `icon` ya admite cualquier `keyof typeof Ionicons.glyphMap`.)

- [ ] **Step 5: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 6: Verificación manual (Expo)**

Login → pestaña **Más** → **Mi perfil**. Confirmar: se ven Email y Rol; editar el nombre y "Guardar" lo actualiza (y se refleja en la app); "Cambiar contraseña" con la actual correcta y una nueva válida funciona; con la actual incorrecta o una nueva débil muestra el error del backend. Capturar cualquier problema.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/features/profile/ProfileScreen.tsx mobile/src/navigation/types.ts mobile/src/navigation/MainTabs.tsx mobile/src/features/menu/MenuScreen.tsx
git commit -m "feat(profile movil): pantalla Mi perfil con edicion de nombre y cambio de contrasena

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 → 2 → 3. La 2 necesita el backend de la 1 reiniciado para el `gen:api`; la 3 usa los hooks de la 2 y `refreshUser` de la 2.
- **Gate:** backend con pytest; móvil con `npm run typecheck` + verificación manual (Task 3, Step 6).
- **Fuera de alcance (follow-ups):** el mismo autoservicio en la web; rotar el JWT al cambiar la contraseña; foto de perfil; cambiar el email propio.
```
