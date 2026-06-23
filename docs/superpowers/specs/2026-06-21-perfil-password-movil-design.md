# Perfil y cambio de contraseña en móvil — Diseño

**Fecha:** 2026-06-21
**Estado:** Aprobado por el usuario; listo para plan de implementación.
**Alcance:** Backend (`users`: editar nombre propio + endpoint de cambio de contraseña) · App móvil (pantalla de perfil). No toca el frontend web.

---

## 1. Contexto y problema

La app móvil no tiene pantalla de perfil: el técnico no puede ver su cuenta, editar su
nombre ni cambiar su contraseña desde el celular. Hoy `MeView` (`apps/users/views.py`) es
solo lectura (`RetrieveAPIView` con `UserSerializer`) y **no existe** endpoint de cambio
de contraseña. La gestión de usuarios admin (web) sí puede setear contraseñas, pero no es
autoservicio.

Decisión acordada: el técnico puede **ver** su email y rol (solo lectura), **editar** su
nombre completo, y **cambiar** su contraseña (pidiendo la actual). Email y rol siguen
gestionados por admin.

## 2. Backend (`apps/users/`)

### 2.1 Editar el nombre propio

- `MeView`: cambiar de `generics.RetrieveAPIView` a `generics.RetrieveUpdateAPIView`.
  El `UserSerializer` ya tiene `read_only_fields = ("id", "email", "role", "is_active")`
  y solo `full_name` editable, así que `PATCH /api/auth/me/ {full_name}` actualiza el
  nombre sin permitir cambiar email/rol. `get_object` sigue devolviendo `request.user`.
- No se necesita serializer nuevo ni migración.

### 2.2 Cambiar la contraseña

- Nuevo `ChangePasswordView(APIView)`, `permission_classes=[IsAuthenticated]`, en
  `apps/users/views.py`, ruta `POST /api/auth/change-password/` en `apps/users/urls.py`.
- `ChangePasswordSerializer` (nuevo, en `apps/users/serializers.py`): campos
  `current_password` y `new_password`, ambos `write_only`.
- Lógica del `post`:
  1. Valida el serializer.
  2. Si `not request.user.check_password(current_password)` → `ValidationError`
     `{"current_password": "La contraseña actual no es correcta."}` (400).
  3. `validate_password(new_password, user=request.user)` (de
     `django.contrib.auth.password_validation`) → 400 con el detalle si es débil.
  4. `request.user.set_password(new_password)` + `request.user.save(update_fields=["password"])`.
  5. Responde 200 `{"detail": "Contraseña actualizada."}`.
- El JWT vigente **no** se invalida (cambiar la contraseña no rota tokens), así que la
  sesión actual sigue activa. Aceptable para el MVP.

## 3. App móvil

### 3.1 Navegación

- Nuevo destino `Profile` en `MoreStackParamList` (`navigation/types.ts`) y su
  `MoreStack.Screen` en `MainTabs.tsx` (título "Mi perfil").
- Nuevo ítem **"Mi perfil"** en `MenuScreen` (pestaña Más), en el grupo "General" (junto a
  Reportes/Configuración), que navega a `Profile`.

### 3.2 `ProfileScreen` (`mobile/src/features/profile/`)

- **`api.ts`**: hooks
  - `useUpdateName()` → `PATCH /api/auth/me/ {full_name}`.
  - `useChangePassword()` → `POST /api/auth/change-password/ {current_password, new_password}`;
    en error, extrae el mensaje del backend (mismo patrón que `userErrorMessage` de la web).
- **`ProfileScreen.tsx`**:
  - Card de solo lectura: **Email** y **Rol** (con etiqueta legible; reutilizar el mapa de
    roles si existe en móvil, o uno local).
  - Sección **Datos**: `LabeledInput` Nombre completo (precargado desde `useAuth().user`) +
    botón "Guardar". Al éxito: `Alert` "Perfil actualizado" y **refrescar el usuario en
    `AuthContext`**.
  - Sección **Cambiar contraseña**: `LabeledInput` Contraseña actual + Nueva contraseña
    (ambos `secureTextEntry`) + botón "Cambiar". Al éxito: `Alert` y limpia los campos;
    al error: `Alert` con el mensaje del backend.

### 3.3 Refresco del usuario en `AuthContext`

- Exponer `refreshUser()` en el contexto (`AuthContext.tsx`): re-ejecuta el `loadMe`
  existente (`GET /api/auth/me/` → `setUser`). `ProfileScreen` lo llama tras guardar el
  nombre, para que el nombre actualizado se refleje en toda la app.

## 4. Tests

### 4.1 Backend (pytest)

- `PATCH /api/auth/me/` con `{full_name}` → 200 y el nombre cambia.
- `PATCH /api/auth/me/` con `{email}` o `{role}` → esos campos NO cambian (read-only).
- `change-password` con `current_password` incorrecta → 400 (clave `current_password`).
- `change-password` con `new_password` débil → 400.
- `change-password` correcta → 200; el usuario puede iniciar sesión con la nueva contraseña
  (`check_password(new)` verdadero) y no con la vieja.
- `change-password` sin autenticar → 401.

### 4.2 Móvil

Sin framework de tests: gate = `npm run typecheck` + verificación manual en Expo
(login → Más → Mi perfil → editar nombre y cambiar contraseña).

## 5. Fuera de alcance (follow-ups)

- El mismo autoservicio de perfil/contraseña en la **web** (el endpoint
  `change-password` queda disponible para reutilizar).
- Invalidar/rotar el JWT al cambiar la contraseña (cerrar otras sesiones).
- Foto de perfil / avatar.
- Cambiar el email propio (queda gestionado por admin).
