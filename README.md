# Veragro ERP

ERP modular para una operación agro-tecnológica (mantenimiento de drones/equipos, inventario de
repuestos, proveedores, compras, clientes, órdenes de servicio con checklists, cotizaciones y
facturación). Dos frentes: **backend** (Django + DRF) y **panel web** (React + Vite).

Documento maestro de requisitos: [`Documento_Desarrollo_ERP_Veragro_v2_Android.md`](Documento_Desarrollo_ERP_Veragro_v2_Android.md).

## Stack

| Capa | Tecnología |
|---|---|
| **Backend** | Python 3.12, Django 5.1, Django REST Framework, JWT (simplejwt), drf-spectacular (OpenAPI), ReportLab (PDF), PostgreSQL 16, Redis 7 |
| **Web** | React 19, Vite, TypeScript, Mantine 9, TanStack Query v5, openapi-fetch (cliente tipado), React Router v7, Vitest + RTL |
| **Infra** | Docker Compose (db, redis, backend, frontend). El backend expone `:8000` para un Nginx externo (Proxmox) como reverse proxy / TLS |

## Estado del proyecto

**Completo y operable end-to-end** desde el panel web. Backend y web con suites de tests en verde
(pytest y Vitest).

### Backend — 10 módulos

| Módulo | Endpoints principales |
|---|---|
| Auth + Usuarios | `/api/auth/{login,refresh,me}/`, `/api/users/` |
| Clientes | `/api/customers/` |
| Equipos | `/api/equipment/`, `/api/equipment/types/`, **catálogo técnico** `/api/equipment/{models,components}/` + `models/{id}/component-tree/` |
| Inventario | `/api/inventory/{products,adjustments,low-stock,categories}/`, import/export CSV, **compatibilidades** `/api/inventory/product-compatibilities/` |
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

### Catálogo técnico y despiece interactivo

Capa de catálogo que estructura la relación equipo↔repuesto para el taller:

- **Modelos técnicos** (`EquipmentModel`) normalizados y un **árbol de componentes**
  (`EquipmentComponent`: conjuntos y posiciones reemplazables, p. ej. *Sistema de propulsión →
  Brazo M1 → Motor M1*). Un equipo físico se asocia a su modelo técnico.
- **Compatibilidad estructurada** (`ProductCompatibility`): una pieza del inventario se declara
  compatible con un modelo y un componente exacto (una pieza puede servir a varios modelos y
  posiciones). Se administra desde el web (ficha de producto) y desde el formulario de equipo.
- **Despiece** en la orden de servicio: pestaña *Despiece* que lista todas las piezas del modelo del
  equipo, agrupadas por categoría, con buscador (nombre, SKU, N.º de pieza, categoría) y filtro por
  categoría; cada pieza muestra existencia, reservado, precio y ubicación, con un botón para
  agregarla a la orden guardando **en qué componente** se instala. El backend valida la
  compatibilidad (no se confía en el filtro del frontend) y conserva el modo manual anterior.
- **Línea DJI sembrada** por migración: todos los drones Agras (MG-1 a T100) y las plantas de
  energía (D6000i a D14000iE), cada uno como tipo de equipo y modelo técnico. Árbol del
  D12500iE con `manage.py seed_equipment_catalog`; piezas reales del T50 con
  `manage.py import_agras_t50_parts <xlsx>`.

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

## Autenticación

JWT. `POST /api/auth/login/` con `{"email", "password"}` devuelve `access` y `refresh`.
Usar `Authorization: Bearer <access>` en las peticiones. `POST /api/auth/refresh/` renueva el
access y rota el refresh (el anterior queda en lista negra); `POST /api/auth/logout/` invalida el
refresh; `GET /api/auth/me/` devuelve el usuario actual. El login está limitado por IP.

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

Guía completa paso a paso (backend y panel web) en **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

Resumen:
- **Backend:** `config.settings.production` exige `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
  `CORS_ALLOWED_ORIGINS` (sin defaults). Incluye endurecimiento HTTPS (HSTS, cookies seguras, SSL
  redirect) asumiendo que Nginx termina TLS. La imagen sirve la app con **Gunicorn**; servir `/media/`
  y `/static/` desde Nginx.
- **Web:** `npm run build` con `VITE_API_URL` apuntando al dominio del backend → servir el `dist/`
  estático desde Nginx (o el contenedor `frontend/Dockerfile.prod`, con cabeceras de seguridad).

## Flujo de desarrollo

Cada módulo siguió el ciclo **brainstorm → spec (`docs/superpowers/specs/`) → plan
(`docs/superpowers/plans/`) → ejecución TDD por tareas con doble revisión (spec + calidad)**.
Commits en español; tests en verde antes de integrar a `master`.

## Licencia

[MIT](LICENSE) © 2026 Victor Vergara
