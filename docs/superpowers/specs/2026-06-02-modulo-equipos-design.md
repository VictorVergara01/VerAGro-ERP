# Spec — Módulo de Equipos Veragro ERP

**Fecha:** 2026-06-02
**Estado:** Aprobado
**Sub-proyecto:** 2 — Módulo de Equipos (`apps.equipment`)

## 1. Contexto y alcance

Segundo sub-proyecto del ERP Veragro, sobre la fundación backend ya mergeada a `master`
(Custom User + JWT + módulo Clientes). Implementa el módulo de Equipos del documento
maestro (§5.3 y API §7.3). Los equipos son el núcleo operativo junto a las órdenes de
servicio: pertenecen a clientes o a la empresa, tienen un tipo, y conservarán historial de
mantenimiento.

### Dentro del alcance

- Modelo `EquipmentType` (tabla lookup) con seed por data migration y endpoint read-only.
- Modelo `Equipment` con los campos del doc §5.3.
- API CRUD de equipos con búsqueda y filtros.
- Soft-delete vía `status="retired"`.
- Validación cruzada owner_type/customer.
- Endpoint placeholder `/equipment/{id}/service-history/`.
- Permiso reutilizable por rol `RoleWriteOrReadOnly` en `apps.core`.
- Tests TDD + verificación de arranque.

### Fuera del alcance (diferido)

- Frontend (web/móvil).
- Conexión real de service-history (depende del módulo service_orders).
- CRUD de tipos de equipo vía API (solo admin de Django + seed por ahora).
- Reportes de equipos (MVP5).

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Tipo de equipo | Modelo `EquipmentType` (FK) | El doc usa `equipment_type_id`; los checklists se vinculan por tipo. Una tabla permite asociar plantillas y añadir tipos sin tocar código. |
| Seed/exposición de tipos | Data migration + endpoint read-only | Reproducible en cualquier entorno; el frontend necesita listar tipos para selectores. CRUD de tipos es YAGNI ahora. |
| Soft-delete de equipos | `DELETE` ⇒ `status="retired"` | El doc da a Equipment un `status` rico que ya incluye `retired`. Preserva trazabilidad/historial; más alineado al dominio que un `is_active` aparte. |
| Permisos | `RoleWriteOrReadOnly("admin","technician","sales","inventory")` | Lectura para todo autenticado; escritura para todos los roles menos `readonly`. Matriz confirmada con el usuario. Cierra el follow-up de permisos con una herramienta reutilizable. |
| `on_delete` de FKs | `PROTECT` (customer y equipment_type) | Evita borrar clientes/tipos con equipos asociados; integridad referencial. |

## 3. Modelos (`backend/apps/equipment/models.py`)

### EquipmentType (hereda TimeStampedModel)
- `name`: CharField(max_length=100), unique
- `is_active`: BooleanField(default=True)
- Meta.ordering = ("name",); `__str__` → name

Seed (data migration) con los 9 tipos del doc §5.3:
Drone agrícola, Drone de mapeo, Planta eléctrica, Cargador, Batería, Bomba, Atomizador,
Control remoto, Otro.

### Equipment (hereda TimeStampedModel)
- `owner_type`: CharField choices `customer`/`company` (TextChoices), default `customer`
- `customer`: FK→`customers.Customer`, null=True, blank=True, on_delete=PROTECT, related_name="equipment"
- `equipment_type`: FK→`EquipmentType`, on_delete=PROTECT, related_name="equipment"
- `name`: CharField(max_length=255)
- `brand`: CharField blank
- `model`: CharField blank
- `serial_number`: CharField blank
- `internal_code`: CharField blank
- `purchase_date`: DateField null=True, blank=True
- `warranty_expiration`: DateField null=True, blank=True
- `status`: CharField choices active/in_maintenance/out_of_service/sold/retired (TextChoices), default active
- `notes`: TextField blank
- Meta.ordering = ("name",); `__str__` → name

## 4. Permiso reutilizable (`backend/apps/core/permissions.py`)

Añadir fábrica:
```python
def RoleWriteOrReadOnly(*write_roles):
    """Lectura para cualquier autenticado; escritura solo para los roles dados."""
    allowed = set(write_roles)

    class _Perm(BasePermission):
        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            if request.method in SAFE_METHODS:
                return True
            return request.user.role in allowed

    return _Perm
```
(Convención: nombre en PascalCase aunque sea función-fábrica, para que se lea como clase de
permiso en `permission_classes`.)

## 5. API

Router DRF en `backend/apps/equipment/urls.py`, incluido en `config/urls.py` bajo `/api/`.

- `EquipmentViewSet` (ModelViewSet) en `/api/equipment/`:
  - permission_classes = [RoleWriteOrReadOnly("admin","technician","sales","inventory")]
  - SearchFilter: `name`, `serial_number`, `internal_code`, `brand`, `model`
  - Filtrado en `get_queryset` leyendo query params `status`, `customer`, `equipment_type`
    (sin dependencia nueva)
  - `perform_destroy`: soft-delete ⇒ `status="retired"`, save(update_fields=["status","updated_at"])
  - `@action service-history` (detail, GET): valida existencia y devuelve `[]` (TODO: conectar service_orders)
- Endpoint read-only de tipos:
  - `GET /api/equipment/types/` → lista de `EquipmentType` activos (id, name). Solo lectura
    (ReadOnlyModelViewSet o ListAPIView). Permiso: IsAuthenticated.

### Validación cruzada (serializer)
Con fallback a la instancia para PATCH parcial (lección del módulo Clientes):
- `owner_type == "customer"` ⇒ `customer` obligatorio (ValidationError si falta).
- `owner_type == "company"` ⇒ `customer` debe ser nulo (ValidationError si viene).

### Filtrado
Filtrado manual en `get_queryset`: si vienen los query params `status`, `customer` o
`equipment_type`, se aplican como `.filter(...)`. Sin dependencias nuevas (no se añade
`django-filter`), manteniendo el patrón simple usado en Clientes.

## 6. Pruebas (TDD)

- **Modelos** (`tests/test_models.py`): crear Equipment (defaults status=active, str==name);
  EquipmentType str; relación customer/equipment.
- **Permisos** (`apps/core/tests/test_permissions.py`, ampliar): `RoleWriteOrReadOnly`
  permite lectura a cualquier autenticado, permite escritura a rol listado, bloquea
  escritura a rol no listado (readonly).
- **API** (`tests/test_api.py`): CRUD; búsqueda por serial; filtro por status/customer;
  soft-delete (DELETE ⇒ status retired, registro persiste); validación owner/customer en
  create y en PATCH parcial; endpoint de tipos read-only devuelve los sembrados; tipos no
  escribibles vía API (POST a /types/ → 405); service-history → `[]`; 401 sin auth;
  `readonly` no puede crear (403); rol permitido sí puede.

## 7. Verificación

- `docker compose run --rm backend python manage.py makemigrations` → migraciones de
  equipment (modelos + data migration de seed) creadas y committeadas.
- `migrate` aplica seed; `GET /api/equipment/types/` devuelve 9 tipos.
- `manage.py check` sin issues; `makemigrations --check --dry-run` sin cambios.
- Suite pytest completa en verde (fundación 27 + nuevos de equipos).
- Verificación en vivo: crear equipo de cliente y de empresa, listar/filtrar, soft-delete.

## 8. Criterio de aceptación

- Tipos sembrados y expuestos read-only.
- CRUD de equipos con búsqueda, filtros y soft-delete vía status.
- Validación owner/customer correcta en create y PATCH.
- Permisos por rol aplicados (readonly solo lee).
- service-history placeholder responde `[]`.
- OpenAPI documenta los endpoints; suite en verde.

## 9. Siguientes sub-proyectos

Inventario → Proveedores → Compras (costeo proporcional) → Órdenes de Servicio →
Checklists → Cotizaciones/Facturación → Reportes → Frontend. Ver doc §13.
