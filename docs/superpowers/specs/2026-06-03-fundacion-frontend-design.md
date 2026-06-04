# Spec — Fundación Frontend Web Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 10 — Fundación Frontend Web (`frontend/`)

## 1. Contexto y alcance

Primer sub-proyecto de frontend, sobre `master` (backend completo, 9 módulos, API REST + OpenAPI
en `/api/docs/`). Crea el panel web admin (doc §9/§10) con su andamiaje, autenticación y la
primera página (Dashboard). Los demás features (Clientes, Equipos, …) vendrán en slices propios.

### Stack (decisiones confirmadas)
- **Vite + React 18 + TypeScript**. Plataforma web primero (1a).
- **Mantine** (UI: AppShell, tablas, formularios, modales, notificaciones) (2a).
- **openapi-typescript + openapi-fetch** sobre el schema OpenAPI → tipos end-to-end; **TanStack
  Query** para data fetching/caché (3a).
- **React Router** para routing.
- **Servicio `frontend` en docker-compose** (Vite dev en 5173); también corre local `npm run dev` (4a).
- **Vitest + React Testing Library** para pruebas.

### Dentro del alcance
- Scaffold `frontend/` (estructura doc §9: app/components/features/hooks/lib/routes/types/utils).
- Cliente API tipado: generación de tipos desde `/api/schema/`, `openapi-fetch` con middleware que
  inyecta el JWT y maneja 401.
- **Auth**: login (`/api/auth/login/`), almacenamiento de tokens, `/api/auth/me/`, contexto de auth,
  refresh de token, rutas protegidas, logout.
- **Layout**: `AppShell` Mantine con sidebar (navegación a todas las secciones, marcando las
  pendientes) + topbar (usuario, rol, logout). Tema claro/limpio.
- **Dashboard**: consume `/api/reports/dashboard/`; tarjetas del doc §10 (órdenes abiertas,
  esperando piezas, facturas pendientes, bajo stock, ventas del mes, terminados del mes).
- Docker: servicio `frontend`, `Dockerfile`, `.dockerignore`, `.env.example` (`VITE_API_URL`).
- Tests: auth store/flow, render del layout y del dashboard (con fetch mockeado).

### Fuera del alcance (diferido a slices siguientes)
- CRUD de cada feature (Clientes, Equipos, Inventario, Proveedores, Compras, Órdenes, Checklists,
  Cotizaciones, Facturas, Reportes detallados) → un slice por feature.
- Generación de PDF (doc §11).
- Frontend móvil (React Native/Expo) → bloque posterior.
- i18n, theming avanzado, tests E2E.

## 2. Decisiones de diseño

| Tema | Elección | Razón |
|---|---|---|
| Tokens JWT | `access` en memoria + `localStorage`; `refresh` en `localStorage` | Simplicidad MVP; refresh automático ante 401. Endurecer (httpOnly) es follow-up. |
| Generación de tipos | `openapi-typescript` contra `/api/schema/` → `src/lib/api/schema.d.ts` (commiteado); script `npm run gen:api` | Reproducible; tipos end-to-end sin codegen de cliente. |
| Estado servidor | TanStack Query (claves por recurso) | Caché, refetch, loading/error estandarizados. |
| Estado auth | Context + hook `useAuth` (no Redux) | Suficiente para auth global. |
| Navegación por rol | El sidebar muestra todo; el backend ya valida permisos por rol. Ocultar/disable por rol = follow-up | No duplicar la matriz de permisos en el front todavía. |
| Rutas | `/login` público; resto bajo `ProtectedRoute` + layout | Estándar. |

## 3. Estructura (`frontend/src/`)
```
app/            App.tsx (providers: Mantine, QueryClient, Router, Auth), main.tsx
routes/         AppRoutes.tsx, ProtectedRoute.tsx
components/
  layout/       AppLayout.tsx (AppShell), Sidebar.tsx, Topbar.tsx
features/
  auth/         AuthContext.tsx, useAuth.ts, LoginPage.tsx
  dashboard/    DashboardPage.tsx, StatCard.tsx, useDashboard.ts
lib/
  api/          client.ts (openapi-fetch + auth middleware), schema.d.ts (generado), queryClient.ts
  auth/         tokens.ts (get/set/clear en localStorage)
types/          (tipos compartidos)
utils/          format.ts (moneda, fecha)
```

## 4. Cliente API (`lib/api/client.ts`)
- `createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL })`.
- Middleware `onRequest`: añade `Authorization: Bearer <access>` si hay token.
- Middleware `onResponse`: si 401 y hay `refresh`, intenta `/api/auth/refresh/`; si falla, limpia
  tokens y redirige a `/login`.
- `tokens.ts`: `getAccess/setTokens/clear`, claves `veragro.access` / `veragro.refresh`.

## 5. Auth (`features/auth/`)
- `AuthContext`: `{ user, status: 'loading'|'authenticated'|'anonymous', login(email,pw), logout() }`.
- Al montar: si hay token, `GET /api/auth/me/` → user; si 401, anónimo.
- `login`: `POST /api/auth/login/` → guarda tokens → `me` → user.
- `LoginPage`: form Mantine (email, password), validación, error legible, submit deshabilitado
  mientras carga. Redirige a `/` tras éxito.
- `ProtectedRoute`: si `loading` → spinner; si `anonymous` → `<Navigate to="/login">`.

## 6. Layout (`components/layout/`)
- `AppLayout`: `AppShell` con `navbar` (Sidebar) y `header` (Topbar); `<Outlet/>` para el contenido.
- `Sidebar`: enlaces a Dashboard, Clientes, Equipos, Inventario, Proveedores, Compras, Órdenes de
  servicio, Checklists, Cotizaciones, Facturas, Reportes, Configuración. Solo Dashboard activo; el
  resto marcado "próximamente" (disabled o badge) hasta su slice.
- `Topbar`: nombre/rol del usuario + botón logout. Responsive (burger para móvil).

## 7. Dashboard (`features/dashboard/`)
- `useDashboard`: `useQuery(['dashboard'], () => client.GET('/api/reports/dashboard/'))`.
- `DashboardPage`: grid de `StatCard` con: Órdenes abiertas (suma de estados pendientes),
  Esperando piezas (`waiting_parts`), Facturas pendientes (`invoices.pending_count` + monto),
  Piezas bajo stock (`inventory.low_stock_count`), Ventas del mes (`invoices.sales_this_month`),
  Servicios terminados del mes (de `service_orders_by_status`). Loading (skeletons) y error.
  Solo admin/sales ven el dashboard (el backend devuelve 403 a otros) → mostrar aviso amable si 403.

## 8. Docker
- `frontend/Dockerfile` (node:22-alpine; instala deps; `CMD npm run dev -- --host`).
- Servicio `frontend` en `docker-compose.yml`: build ./frontend, puerto 5173:5173, volumen
  `./frontend:/app` + `/app/node_modules`, `environment: VITE_API_URL`, depends_on backend.
- `frontend/.dockerignore` (node_modules, dist). `frontend/.env.example` (`VITE_API_URL=http://localhost:8000/api`).
- Vite config: `server.host=true`, `port=5173`.

## 9. Pruebas (Vitest + RTL)
- `tokens.ts`: set/get/clear.
- `AuthContext`: login exitoso setea user (fetch mockeado); 401 deja anónimo.
- `ProtectedRoute`: redirige a /login si anónimo; renderiza hijo si autenticado.
- `DashboardPage`: renderiza tarjetas con datos mockeados; estado de carga.
- Config: `vitest` con jsdom, setup de RTL, mock de `openapi-fetch`/`fetch`.

## 10. Verificación
- `npm install`, `npm run gen:api` (tipos generados), `npm run build` (tsc + vite build) sin errores,
  `npm run test` en verde, `npm run lint` (si se configura).
- `docker compose up frontend` levanta Vite en :5173.
- En vivo: login con un usuario real (p.ej. admin@veragro.com), ver el Dashboard con datos del
  backend, logout, ruta protegida redirige a /login.

## 11. Criterio de aceptación
- App Vite+React+TS+Mantine corre en :5173 (local y Docker).
- Login JWT funciona end-to-end contra el backend; rutas protegidas; logout; refresh ante 401.
- Cliente API tipado desde el OpenAPI; Dashboard muestra datos reales de `/api/reports/dashboard/`.
- Layout con navegación a todas las secciones (pendientes marcadas).
- Tests en verde; build sin errores; servicio Docker operativo.

## 12. Siguientes sub-proyectos (frontend)
Un slice por feature siguiendo el orden del doc §9/§13: Clientes → Equipos → Inventario →
Proveedores → Compras/Recepción → Órdenes de servicio (+piezas/reserva) → Checklists →
Cotizaciones → Facturas/Pagos → Reportes → Configuración. Luego móvil (React Native/Expo, MVP2).
