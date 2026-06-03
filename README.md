# Veragro ERP

ERP modular para una operación agro-tecnológica (fumigación con drones, mantenimiento de
drones/equipos, inventario de repuestos, proveedores, compras, clientes, cotizaciones y
facturación). Backend monolito modular (Django + DRF), preparado para crecer hacia
microservicios. Documento maestro de requisitos: [`Documento_Desarrollo_ERP_Veragro_v2_Android.md`](Documento_Desarrollo_ERP_Veragro_v2_Android.md).

## Stack

- **Backend:** Python 3.12, Django 5.1, Django REST Framework, JWT (simplejwt),
  drf-spectacular (OpenAPI), PostgreSQL 16, Redis 7.
- **Infra:** Docker Compose (db, redis, backend). El backend expone el puerto `8000` para que
  el Nginx externo (Proxmox) actúe de reverse proxy.
- **Frontend web (React/Vite) y móvil (React Native/Expo):** pendientes.

## Estructura

```
backend/
  config/settings/{base,development,production}.py
  apps/
    core/         # TimeStampedModel, permisos (IsAdmin, IsAdminOrReadOnly,
                  # role_required, RoleWriteOrReadOnly)
    users/        # Custom User (login por email + rol) + JWT
    customers/    # Clientes
    equipment/    # Equipos + tipos de equipo
    inventory/    # Productos, categorías, movimientos, ajustes de stock
    suppliers/    # Proveedores + relación proveedor-producto
    purchasing/ service_orders/ checklists/ billing/ reports/   # pendientes
docs/superpowers/
  specs/   # diseño aprobado de cada sub-proyecto
  plans/   # plan de implementación de cada sub-proyecto
```

## Cómo correr (desarrollo)

Requisitos: Docker Desktop.

```bash
# 1. Variables de entorno (la primera vez)
cp .env.example .env          # en Windows PowerShell: Copy-Item .env.example .env

# 2. Levantar todo
docker compose up -d --build

# 3. Migraciones
docker compose exec backend python manage.py migrate

# 4. Crear un superusuario (login por email)
docker compose exec backend python manage.py createsuperuser

# 5. Tests
docker compose run --rm backend pytest -q
```

- API: `http://localhost:8000/api/`
- Documentación OpenAPI (Swagger): `http://localhost:8000/api/docs/`
- Admin de Django: `http://localhost:8000/admin/`

## Autenticación

JWT. `POST /api/auth/login/` con `{"email", "password"}` devuelve `access` y `refresh`.
Usar `Authorization: Bearer <access>` en las peticiones. `POST /api/auth/refresh/` renueva el
access; `GET /api/auth/me/` devuelve el usuario actual.

Roles: `admin`, `technician`, `sales`, `inventory`, `readonly`.

## Módulos completados

| Sub-proyecto | Estado | Endpoints principales |
|---|---|---|
| Fundación + Auth + Clientes | ✅ | `/api/auth/*`, `/api/customers/` |
| Equipos | ✅ | `/api/equipment/`, `/api/equipment/types/` |
| Inventario | ✅ | `/api/inventory/{products,adjustments,low-stock,categories}/` |
| Proveedores | ✅ | `/api/suppliers/`, `/api/supplier-products/` |
| Compras (costeo proporcional) | ⏳ siguiente | — |
| Órdenes de servicio, Checklists, Facturación, Reportes | ⏳ | — |

Detalles de cada módulo (modelos, reglas, permisos) en `docs/superpowers/specs/` y
`docs/superpowers/plans/`.

### Notas de diseño relevantes

- **Inventario:** `stock_quantity`/`reserved_quantity` son **read-only** en el CRUD; todo
  cambio de stock pasa por un movimiento (`/adjustments/`, atómico, sin permitir negativos).
- **Soft-delete:** clientes/inventario/proveedores usan `is_active=False`; equipos usan
  `status=retired`. Nada se borra físicamente.
- **Permisos por rol:** escritura restringida con `RoleWriteOrReadOnly`; lectura para
  cualquier usuario autenticado.

## Flujo de desarrollo

Cada módulo sigue el ciclo: **brainstorm → spec (`docs/superpowers/specs/`) → plan
(`docs/superpowers/plans/`) → ejecución TDD por tareas con doble revisión (spec + calidad)**.
Commits en español; tests siempre en verde antes de integrar a `master`.

## Despliegue (producción)

`config.settings.production` exige `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` y
`CORS_ALLOWED_ORIGINS` por entorno (sin defaults). Servir el backend con Gunicorn detrás del
Nginx de Proxmox (ver `Documento_Desarrollo_ERP_Veragro_v2_Android.md` §2.3).
