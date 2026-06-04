# Spec — Fundación Frontend Móvil Veragro ERP

**Fecha:** 2026-06-04
**Estado:** Aprobado
**Sub-proyecto:** 22 — Fundación móvil (`mobile/`)

## 1. Contexto y alcance
App de campo para técnicos (doc §6.9, MVP2), sobre el mismo backend REST. Primera fase: andamiaje,
auth y la pantalla "Mis órdenes". El resto (detalle/estados, checklist, piezas, inventario) en slices
siguientes. **Verificación limitada**: sin emulador en este entorno → se valida con `tsc`/lint/
`expo export`; el usuario prueba en **Expo Go**.

### Stack
- **Expo (managed) + React Native + TypeScript** (template `blank-typescript`).
- **React Navigation** (native-stack) — explícito, sin convenciones de file-router (más fácil de
  razonar sin poder ejecutar).
- **TanStack Query** + **openapi-fetch** + tipos generados del OpenAPI (`schema.d.ts`).
- **expo-secure-store** para los tokens JWT.
- UI: componentes core de RN + estilos propios (mínimo, bajo riesgo). Sin librería de UI todavía.

### Dentro del alcance
- Scaffold `mobile/` con estructura `src/` (lib/api, lib/auth, features/auth, features/orders,
  navigation).
- Cliente API: `createClient<paths>` con baseUrl derivada del host de Expo
  (`Constants.expoConfig.hostUri` → IP del dev) puerto 8000, o `EXPO_PUBLIC_API_URL`. Middleware
  que inyecta el JWT y, ante 401, intenta refresh; si falla, logout.
- Auth: login (`/api/auth/login/`), tokens en SecureStore, `/api/auth/me/`, contexto, logout.
- Navegación: stack raíz que conmuta entre AuthStack (Login) y AppStack (MyOrders) según estado.
- **Mis órdenes**: lista de `/api/service-orders/?technician=<me.id>` con pull-to-refresh; toggle
  "Ver todas" (sin filtro) por si el técnico no tiene asignadas. Card por orden (número, cliente,
  estado, tipo).
- README de `mobile/` con cómo correr (Expo Go, IP, backend).

### Fuera del alcance (slices siguientes / follow-ups)
- Detalle de orden + cambio de estado, checklist, piezas, búsqueda de inventario.
- **Fotos** (requiere modelo de adjuntos en backend) → follow-up.
- Notificaciones push, modo offline.

## 2. Decisiones
| Tema | Elección | Razón |
|---|---|---|
| Navegación | React Navigation native-stack | Explícito; sin magia de expo-router (no puedo ejecutar para depurar convenciones). |
| Tokens | expo-secure-store | Almacenamiento seguro nativo. |
| Base URL | Derivada de `Constants.expoConfig.hostUri` (IP del dev) :8000, fallback `EXPO_PUBLIC_API_URL` | El teléfono no resuelve `localhost`; usa la IP LAN del Metro. CORS no aplica (fetch nativo). |
| UI | RN core | Menos dependencias nativas que puedan fallar sin poder probar. |

## 3. Estructura (`mobile/src/`)
```
lib/api/        client.ts (openapi-fetch + middleware), schema.d.ts (generado), queryClient.ts, baseUrl.ts
lib/auth/       tokens.ts (SecureStore)
features/auth/  AuthContext.tsx, useAuth.ts, LoginScreen.tsx
features/orders/ MyOrdersScreen.tsx, api.ts
navigation/     RootNavigator.tsx
theme.ts        colores/spacing
```
`App.tsx`: providers (QueryClientProvider, AuthProvider, NavigationContainer → RootNavigator).

## 4. Cliente API y baseUrl
- `baseUrl.ts`: si `EXPO_PUBLIC_API_URL` está definido, úsalo; si no, toma
  `Constants.expoConfig?.hostUri` (p.ej. `192.168.1.100:8081`), extrae la IP y arma
  `http://<ip>:8000`. Fallback final `http://localhost:8000`.
- `client.ts`: middleware onRequest añade `Authorization`; onResponse 401 → refresh (POST
  `/api/auth/refresh/`) y reintenta; si falla → `clearTokens()` + evento de logout.
- `tokens.ts`: `getAccess/getRefresh/setTokens/clear` con `expo-secure-store`.

## 5. Auth
- `AuthContext`: `{ user, status: loading|authenticated|anonymous, login, logout }`. Al montar, si
  hay token → `/me/`. `login` guarda tokens y carga el user.
- `LoginScreen`: TextInput email/password, botón, error legible, loading.

## 6. Mis órdenes
- `features/orders/api.ts`: `useMyOrders(technicianId, all)` → GET
  `/api/service-orders/` con `?technician=` (omitido si "ver todas"). Devuelve `results`.
- `MyOrdersScreen`: `FlatList` de cards, `RefreshControl` (pull-to-refresh), switch "Ver todas",
  botón de logout en el header. Badge de estado con color.

## 7. Verificación
- `npx tsc --noEmit` sin errores; `npx expo export` (bundle) sin errores; lint si se configura.
- El usuario: `cd mobile && npm install && npx expo start`, abre en **Expo Go** (misma WiFi que el
  backend), login con un técnico (p.ej. tech@veragro.com / tech12345), ve sus órdenes.

## 8. Criterio de aceptación
- App Expo arranca en Expo Go; login JWT funciona contra el backend; "Mis órdenes" lista las del
  técnico (y "ver todas"); logout. Sin errores de tipos/bundle.

## 9. Siguientes
Detalle de orden + cambio de estado → Checklist → Piezas usadas → Búsqueda de inventario → (backend
fotos + captura). Ver doc §6.9, §13.
