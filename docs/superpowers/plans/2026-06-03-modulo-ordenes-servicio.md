# Plan — Módulo de Órdenes de Servicio (`apps.service_orders`)

**Spec:** `docs/superpowers/specs/2026-06-03-modulo-ordenes-servicio-design.md`
**Rama:** `master` (como los sub-proyectos previos).

## Tareas (TDD: test → implementación → verde)

1. **Servicios de inventario** (`apps/inventory/services.py`)
   - `reserve_stock`, `release_reservation`, `consume_stock` (atómicos, select_for_update).
   - Endurecer `apply_adjustment`: `adjustment_out` contra `available_quantity` (follow-up #11).
   - Tests en `apps/inventory/tests`.

2. **Scaffold + Modelos** (`service_orders`)
   - `apps.py` ya existe; `tests/__init__.py`.
   - `ServiceOrder` + `ServiceOrderPart` (spec §3); `service_order_number` auto `OS-{pk:06d}`.
   - `makemigrations service_orders` → `0001`.
   - Tests modelos.

3. **Servicios del módulo** (`services.py`)
   - `recalculate_totals`, `reserve_parts`, `finish_order`, `cancel_order` (spec §4).
   - Tests `test_services.py`.

4. **Serializers** (`serializers.py`)
   - Part, Order (parts anidado read), Summary.

5. **Views + URLs** (`views.py`, `urls.py`)
   - `ServiceOrderViewSet` (acciones start-diagnostic/approve/start-work/add-part/reserve-parts/
     finish/deliver/cancel; stubs quote/invoice 501), `ServiceOrderPartViewSet`.
   - Permisos `RoleWriteOrReadOnly("admin","technician")`. Filtros + búsqueda + guards de estado.
   - Incluir router en `config/urls.py`.
   - Tests `test_api.py`.

6. **Conectar historiales**
   - `customers.views.service_orders` y `equipment.views.service_history` → órdenes reales
     paginadas (summary serializer, import local). Actualizar el test viejo del placeholder.

7. **Admin** — registrar ambos modelos con inline de piezas.

8. **Verificación final** — check, makemigrations --check, schema --fail-on-warn, suite verde,
   en vivo (docker compose). Doble review (spec + calidad).

9. **Commit + memoria** — commit en español (trailer Co-Authored-By). Actualizar
   `[[veragro-erp-progreso]]` (módulo Órdenes de Servicio hecho; próximo Checklists) y
   `[[veragro-erp-followups]]` (#11 resuelto; #5 parcialmente; nuevo: solicitud de compra desde
   pending_purchase, quote/invoice stubs).

## Notas
- Reusar patrón atomic + select_for_update + update_fields(updated_at) de inventory/purchasing.
- Sin migraciones cruzadas: enlaces vía reference_type/reference_id.
