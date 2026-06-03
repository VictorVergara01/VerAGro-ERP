# Plan — Módulo de Compras (`apps.purchasing`)

**Spec:** `docs/superpowers/specs/2026-06-03-modulo-compras-design.md`
**Rama:** trabajar en `master` (como los sub-proyectos previos) o feature branch `modulo-compras`.

## Tareas (TDD: test → implementación → verde)

1. **Scaffold de la app**
   - `apps.py` (`name="apps.purchasing"`), registrar en `INSTALLED_APPS` (`config/settings/base.py`).
   - Crear `tests/__init__.py`.

2. **Modelos** (`models.py`) + migración
   - `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseAdditionalCost` (ver spec §3).
   - `order_number` autogenerado `OC-{pk:06d}` en `save()` si vacío (save→pk→set→save).
   - `makemigrations purchasing` → `purchasing.0001`.
   - Tests modelos: autogenerado/unique, status default, CASCADE, __str__.

3. **Servicio de costeo** (`services.py::recalculate_costs`)
   - Distribución proporcional + residuo a última línea + totales (spec §4).
   - Tests: ejemplo doc §5.6 exacto, subtotal 0, residuo, margen, final_sale_price manual.

4. **Servicio de recepción** (`services.py::receive_lines`)
   - Atómico, parcial, promedio ponderado, purchase_in, SupplierProduct.last_cost, transición estado.
   - Tests: parcial→partially_received, completa→received, average_cost ponderado, sobre-recepción,
     estado inválido, sale_price/last_purchase_cost.

5. **Serializers** (`serializers.py`)
   - Line, AdditionalCost, Order (anidados writable en create), OrderSummary.

6. **Views + URLs** (`views.py`, `urls.py`)
   - 3 ViewSets (SimpleRouter), permisos `RoleWriteOrReadOnly("admin","inventory")`.
   - Acciones recalculate/send/receive/cancel; filtros y búsqueda; guard de edición por estado.
   - Incluir router en `config/urls.py`.
   - Tests API (spec §8).

7. **Conectar suppliers purchase-history**
   - Reemplazar placeholder `[]` por las PurchaseOrder del proveedor (paginadas, summary serializer).
   - Test: devuelve órdenes reales.

8. **Admin** (`admin.py`) — registrar los 3 modelos con inlines (líneas/costos) para uso interno.

9. **Verificación final**
   - `check`, `makemigrations --check`, suite completa en verde.
   - En vivo con docker compose (spec §9). Doble review: contra spec + calidad.

10. **Commit + actualizar memoria**
    - Commit en español, trailer `Co-Authored-By: Claude Opus 4.8`.
    - Actualizar `[[veragro-erp-progreso]]` (módulo Compras completado, próximo: Órdenes de
      Servicio) y cerrar follow-up #13 en `[[veragro-erp-followups]]`.

## Notas de integración
- Sin migraciones en otras apps: el enlace a inventario usa `reference_type/reference_id`.
- Reusar el patrón de `inventory/services.py` (atomic + select_for_update + update_fields con updated_at).
- `RoleWriteOrReadOnly` ya existe en `apps.core.permissions`.
