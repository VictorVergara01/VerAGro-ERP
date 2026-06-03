# Spec — Fundación Backend Veragro ERP

**Fecha:** 2026-06-02
**Estado:** Aprobado
**Sub-proyecto:** Fundación backend (primer slice de MVP1)

## 1. Contexto y alcance

El proyecto Veragro ERP (ver `Documento_Desarrollo_ERP_Veragro_v2_Android.md`) es un
monolito modular Django + DRF con frontend web (React) y móvil (React Native),
desplegado con Docker detrás del Nginx existente en Proxmox.

El documento completo es demasiado grande para un solo plan de implementación, por lo
que se aborda **un sub-proyecto a la vez**. Este spec cubre **únicamente la fundación
del backend**: la base sobre la que se construirán todos los módulos posteriores.

### Dentro del alcance

- Scaffold del repositorio y `docker-compose.yml` (Opción A: Docker-first).
- Proyecto Django modular con settings divididos.
- Apps creadas para todos los dominios (la mayoría vacías por ahora).
- Modelo real **Custom User** con login por email y campo de rol.
- Autenticación **JWT** (login, refresh, me).
- Documentación OpenAPI con drf-spectacular.
- CORS preparado para el frontend.
- Clases de permisos por rol reutilizables.
- **Slice vertical de Clientes** completo a nivel backend (modelo → API CRUD).

### Fuera del alcance (diferido)

- Frontend web y móvil.
- Celery / celery_beat (no hay tareas async todavía → diferido a MVP6).
- Modelos de equipment, inventory, suppliers, purchasing, service_orders,
  checklists, billing, reports (se añaden al trabajar cada módulo).
- Generación de PDFs, reportes, lógica de costeo.
- Configuración de Nginx (ya existe en Proxmox).

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Enfoque de trabajo | Docker-first (Opción A) | Fidelidad con producción; valida el Compose desde el día 1. Evita conflictos con el Python 3.14 local. |
| Profundidad de modelos | Incremental | Apps vacías para todos los dominios; modelos reales solo para `users` y `customers`. Migraciones evolucionan por módulo. |
| Usuario y roles | Custom User con email + campo `role` | Recomendado en Django; costoso de cambiar después. Permisos simples por rol. |
| Celery | Diferido | YAGNI: no hay tareas async en esta fase. |

## 3. Entorno verificado

Máquina de desarrollo (Windows 11): Docker 28.5.1 + Compose v2.40, Python 3.14.3
(solo local; el contenedor usa Python 3.12), Node v24.14, npm 11.9, Git 2.52.
El desarrollo y la verificación ocurren **dentro de Docker**, por lo que la versión de
Python local no afecta.

## 4. Estructura del repositorio

```text
VeraGro-ERP/
├── Documento_Desarrollo_ERP_Veragro_v2_Android.md
├── docker-compose.yml          # db, redis, backend (celery diferido)
├── .env                        # variables reales (gitignored)
├── .env.example                # plantilla versionada
├── .gitignore
├── docs/superpowers/specs/     # specs de diseño
└── backend/
    ├── Dockerfile              # python:3.12-slim
    ├── requirements.txt
    ├── pytest.ini              # config pytest-django
    ├── manage.py
    ├── config/
    │   ├── __init__.py
    │   ├── settings/
    │   │   ├── __init__.py
    │   │   ├── base.py
    │   │   ├── development.py
    │   │   └── production.py
    │   ├── urls.py
    │   ├── wsgi.py
    │   └── asgi.py
    └── apps/
        ├── core/               # TimeStampedModel, permisos base, utils
        ├── users/              # ✅ modelo real (Custom User + roles)
        ├── customers/          # ✅ modelo real (slice vertical)
        ├── equipment/          # vacía
        ├── inventory/          # vacía
        ├── suppliers/          # vacía
        ├── purchasing/         # vacía
        ├── service_orders/     # vacía
        ├── checklists/         # vacía
        ├── billing/            # vacía
        └── reports/            # vacía
```

Cada app vacía contiene `__init__.py`, `apps.py` y `migrations/__init__.py`. Las apps con
modelos siguen el patrón del documento (§8): `models.py`, `serializers.py`, `views.py`,
`urls.py`, `services.py`, `permissions.py`, `tests/`, `admin.py` (creados según se necesiten).

## 5. Servicios Docker

`docker-compose.yml` define:

- **db**: `postgres:16`, volumen persistente, healthcheck, credenciales desde `.env`.
- **redis**: `redis:7` (disponible para caché y futura cola Celery).
- **backend**: build desde `backend/Dockerfile`, corre `runserver 0.0.0.0:8000` en dev,
  depende de `db` (healthy), monta el código como volumen para hot-reload, expone `8000`.

Celery/celery_beat quedan documentados como comentario en el Compose para reactivarse en
MVP6. El puerto 8000 queda expuesto para que el Nginx de Proxmox actúe como reverse proxy.

## 6. Configuración Django

- **Settings divididos**: `base.py` con lo común; `development.py` (DEBUG=True, hosts
  laxos) y `production.py` (DEBUG=False, Gunicorn, hosts/CORS restringidos). Selección por
  `DJANGO_SETTINGS_MODULE`; en dev por defecto `config.settings.development`.
- **Variables de entorno** leídas con `django-environ` (o `os.environ`), según
  `.env.example`:
  `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DATABASE_*`,
  `REDIS_URL`, `CORS_ALLOWED_ORIGINS`.
- **Apps instaladas**: las 11 apps de `apps/` + DRF, simplejwt, drf-spectacular,
  corsheaders.
- **DRF**: autenticación JWT por defecto, permiso por defecto `IsAuthenticated`,
  paginación activada, esquema de drf-spectacular.

## 7. App `core`

- `TimeStampedModel` (abstract): `created_at`, `updated_at`. Base para los modelos de
  dominio.
- Clases de permiso reutilizables basadas en `request.user.role`:
  `IsAdmin`, `IsAdminOrReadOnly`, y un helper `RolePermission` parametrizable.

## 8. App `users` (modelo real)

- **Custom User** (`AbstractBaseUser` + `PermissionsMixin`) con:
  - `email` (único, identificador de login; `USERNAME_FIELD = "email"`).
  - `full_name`.
  - `role`: choices `admin`, `technician`, `sales`, `inventory`, `readonly`.
  - `is_active`, `is_staff`, timestamps.
  - Manager con `create_user` / `create_superuser`.
- `AUTH_USER_MODEL = "users.User"` configurado **antes** de la primera migración.
- Registrado en Django Admin.
- **Endpoints de auth** (DRF + simplejwt):
  - `POST /api/auth/login/` → access + refresh.
  - `POST /api/auth/refresh/` → nuevo access.
  - `GET  /api/auth/me/` → datos del usuario autenticado (incluye `role`).

## 9. App `customers` (slice vertical)

- **Modelo `Customer`** (hereda `TimeStampedModel`), campos del documento §5.2:
  `customer_type` (persona/empresa), `name`, `legal_name`, `identification_type`
  (cédula/RUC/pasaporte/otro), `identification_number`, `dv`, `phone`, `whatsapp`,
  `email`, `address`, `province`, `district`, `notes`, `is_active`.
- **Serializer** con validación del par `identification_type` + `identification_number`.
- **ViewSet DRF** registrado en `/api/customers/`:
  - CRUD completo.
  - Búsqueda por `name`, `identification_number`, `phone`, `email` (DRF SearchFilter).
  - **Soft-delete**: `DELETE` marca `is_active=False` en vez de borrar físicamente.
  - Listado filtra activos por defecto, con opción de incluir inactivos.
- **Endpoints de historial declarados** (`/customers/{id}/service-orders/`,
  `/invoices/`, `/equipment/`): devuelven lista vacía por ahora, con TODO para
  conectarse cuando existan esos módulos. (No 501, para no romper el frontend futuro.)
- Registrado en Django Admin.

## 10. Pruebas (TDD) y verificación

### Pruebas automatizadas (pytest-django)

- **users**: `create_user`/`create_superuser`; login devuelve tokens válidos; `/me/`
  exige autenticación y devuelve el rol; refresh funciona.
- **core/permisos**: `IsAdmin` permite a admin y bloquea a otros roles; `IsAdminOrReadOnly`
  permite lectura a todos los autenticados.
- **customers**: creación; validación de identificación; búsqueda por cada campo;
  `DELETE` hace soft-delete (registro persiste con `is_active=False`); el listado excluye
  inactivos por defecto.

### Verificación manual de arranque

1. `docker compose up --build` levanta `db`, `redis`, `backend` sin errores.
2. `docker compose exec backend python manage.py migrate` corre limpio.
3. `/api/docs/` (Swagger UI de drf-spectacular) carga.
4. Crear superusuario; `POST /api/auth/login/` devuelve JWT; `GET /api/auth/me/` con el
   token devuelve el usuario y su rol.
5. CRUD de cliente vía API (crear, listar, buscar, soft-delete).

## 11. Criterio de aceptación de esta fundación

- Los 3 contenedores levantan con `docker compose up`.
- Migraciones corren limpias.
- Login JWT funcional; `/api/auth/me/` protegido.
- CRUD de clientes operativo con búsqueda y soft-delete.
- API documentada en OpenAPI (`/api/docs/`).
- Suite de pytest en verde.

## 12. Siguientes sub-proyectos (no en este spec)

Cada uno con su propio ciclo spec → plan → implementación:
módulo Equipos → Inventario → Proveedores → Compras (costeo proporcional) →
Órdenes de Servicio → Checklists → Cotizaciones/Facturación → Reportes →
Frontend web → Frontend móvil.
