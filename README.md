# Veragro ERP

ERP modular para una operación agro-tecnológica (mantenimiento de drones/equipos, inventario de
repuestos, proveedores, compras, clientes, órdenes de servicio con checklists, cotizaciones y
facturación). Tres frentes: **backend** (Django + DRF), **panel web** (React + Vite) y **app móvil
nativa** (React Native + Expo).

Documento maestro de requisitos: [`Documento_Desarrollo_ERP_Veragro_v2_Android.md`](Documento_Desarrollo_ERP_Veragro_v2_Android.md).

## Stack

| Capa | Tecnología |
|---|---|
| **Backend** | Python 3.12, Django 5.1, Django REST Framework, JWT (simplejwt), drf-spectacular (OpenAPI), ReportLab (PDF), PostgreSQL 16, Redis 7 |
| **Web** | React 19, Vite, TypeScript, Mantine 9, TanStack Query v5, openapi-fetch (cliente tipado), React Router v7, Vitest + RTL |
| **Móvil** | Expo SDK 56, React Native 0.85, React 19, React Navigation, TanStack Query, openapi-fetch, expo-secure-store |
| **Infra** | Docker Compose (db, redis, backend, frontend). El backend expone `:8000` para un Nginx externo (Proxmox) como reverse proxy / TLS |

## Estado del proyecto

**Completo y operable end-to-end.** Backend con 273 tests en verde, web con 41 tests (Vitest),
móvil verificado con `typecheck` + `expo export`.

### Backend — 10 módulos

| Módulo | Endpoints principales |
|---|---|
| Auth + Usuarios | `/api/auth/{login,refresh,me}/`, `/api/users/` |
| Clientes | `/api/customers/` |
| Equipos | `/api/equipment/`, `/api/equipment/types/` |
| Inventario | `/api/inventory/{products,adjustments,low-stock,categories}/`, import/export CSV |
| Proveedores | `/api/suppliers/`, `/api/supplier-products/` |
| Compras (costeo proporcional) | `/api/purchase-orders/` + recepción parcial |
| Órdenes de servicio | `/api/service-orders/` + transiciones de estado, piezas, fotos |
| Checklists | `/api/checklists/templates/`, `/api/service-checklists/` |
| Cotizaciones y Facturación | `/api/quotes/`, `/api/invoices/` + pagos + PDF |
| Reportes | `/api/reports/{dashboard,sales,profit,...}/` |

### Panel web — 13 secciones

Dashboard, Clientes, Equipos, Inventario, Proveedores, Compras, Órdenes de servicio (con checklist
y fotos), Cotizaciones, Facturas, Reportes y Configuración. Identidad visual Veragro, modo claro/oscuro,
gráficas y command palette (Ctrl/⌘+K).

### App móvil

Login, dashboard, y paridad de lectura/escritura con el web: clientes, equipos, proveedores,
inventario (con ajustes), compras, órdenes (transiciones, piezas, reservas, checklist, fotos),
cotizaciones y facturas (emitir, pagar, PDF compartible, WhatsApp), reportes y configuración.
Modo oscuro con toggle. Hoy de uso administrativo.

## Roles y permisos

7 roles con matriz central de permisos (`backend/apps/core/roles.py`, espejada en el frontend):

`super_admin`, `general_admin`, `sales`, `technician`, `inventory`, `accounting`, `readonly`.

La lectura está abierta a todo usuario autenticado; la escritura se restringe por área
(`RoleWriteOrReadOnly` / `role_required`). La gestión de usuarios y la asignación de roles se hace
desde el **admin de Django**.

## Estructura

```
backend/
  config/settings/{base,development,production}.py
  apps/
    core/          # TimeStampedModel, roles.py (matriz de permisos), permisos
    users/         # Custom User (login por email + rol) + JWT
    customers/  equipment/  inventory/  suppliers/  purchasing/
    service_orders/  checklists/  billing/  reports/
frontend/          # Panel web (Vite + React + Mantine)
mobile/            # App nativa (Expo + React Native)
docs/
  branding/        # Identidad visual y referencias de diseño
  superpowers/
    specs/         # diseño aprobado de cada sub-proyecto
    plans/         # plan de implementación de cada sub-proyecto
```

## Cómo correr (desarrollo)

Requisitos: Docker Desktop.

```bash
# 1. Variables de entorno (la primera vez)
cp .env.example .env          # PowerShell: Copy-Item .env.example .env

# 2. Levantar backend, db, redis y frontend
docker compose up -d --build

# 3. Migraciones
docker compose exec backend python manage.py migrate

# 4. Superusuario (login por email; queda con rol super_admin)
docker compose exec backend python manage.py createsuperuser

# 5. Tests del backend
docker compose run --rm backend pytest -q
```

- API: `http://localhost:8000/api/`
- Documentación OpenAPI (Swagger): `http://localhost:8000/api/docs/`
- Admin de Django: `http://localhost:8000/admin/`
- Panel web: `http://localhost:5173/`

### Frontend web (sin Docker)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest
npm run gen:api      # regenera el cliente tipado desde /api/schema/
```

### App móvil

```bash
cd mobile
npm install
npx expo start       # abrir en Expo Go o emulador
npm run typecheck
```

El teléfono no resuelve `localhost`: la base URL se deriva de la IP del dev
(`Constants.expoConfig.hostUri`). En emulador Android: `adb reverse tcp:8000 tcp:8000` y
`EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` en `mobile/.env.local`. Ver [`mobile/README.md`](mobile/README.md).

## Autenticación

JWT. `POST /api/auth/login/` con `{"email", "password"}` devuelve `access` y `refresh`.
Usar `Authorization: Bearer <access>` en las peticiones. `POST /api/auth/refresh/` renueva el
access; `GET /api/auth/me/` devuelve el usuario actual.

## Notas de diseño relevantes

- **Inventario:** `stock_quantity`/`reserved_quantity` son **read-only** en el CRUD; todo cambio de
  stock pasa por un movimiento atómico (`/adjustments/`, sin permitir negativos), dejando rastro en el
  kardex. El margen de ganancia vive en producto/categoría, no en la orden de compra.
- **Soft-delete:** clientes/inventario/proveedores usan `is_active=False`; equipos usan
  `status=retired`. Las órdenes de servicio canceladas sí se eliminan (liberando reservas).
- **Flujo de facturación:** al finalizar una orden se genera la factura (borrador) automáticamente;
  al pagarla por completo la orden pasa a *facturada* y queda lista para entregar.
- **PDF:** facturas y cotizaciones se renderizan con ReportLab; compartibles por descarga/WhatsApp.

## Despliegue (producción)

Guía completa paso a paso (backend, panel web y **APK móvil**) en **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

Resumen:
- **Backend:** `config.settings.production` exige `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
  `CORS_ALLOWED_ORIGINS` (sin defaults). Incluye endurecimiento HTTPS (HSTS, cookies seguras, SSL
  redirect) asumiendo que Nginx termina TLS. La imagen sirve la app con **Gunicorn**; servir `/media/`
  y `/static/` desde Nginx.
- **Web:** `npm run build` con `VITE_API_URL` apuntando al dominio del backend → servir el `dist/`
  estático desde Nginx (o el contenedor `frontend/Dockerfile.prod`).
- **Móvil:** **EAS Build** (`eas build -p android --profile preview`) genera el APK; la URL del backend
  se inyecta vía `EXPO_PUBLIC_API_URL` en `mobile/eas.json`.

## Flujo de desarrollo

Cada módulo siguió el ciclo **brainstorm → spec (`docs/superpowers/specs/`) → plan
(`docs/superpowers/plans/`) → ejecución TDD por tareas con doble revisión (spec + calidad)**.
Commits en español; tests en verde antes de integrar a `master`.

## Licencia

[MIT](LICENSE) © 2026 Victor Vergara
