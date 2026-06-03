# Plan — Módulo de Reportes (`apps.reports`)

**Spec:** `docs/superpowers/specs/2026-06-03-modulo-reportes-design.md`
**Rama:** `master`.

## Tareas (TDD)

1. **Helper + Views** (`views.py`): `_date_range(request)` (parse ?from&to → 400 si inválida);
   6 APIViews (Dashboard, LowStock, ServiceOrders, Sales, Profit, EquipmentHistory) con las
   agregaciones de la spec §5. Permisos: `role_required("admin","sales")` (dashboard/sales/profit),
   `IsAuthenticated` (low-stock/service-orders/equipment-history).
2. **URLs** (`urls.py`): paths §7.11; incluir en `config/urls.py`.
3. **Tests** (`tests/`): permisos, low-stock, service-orders, sales, profit, equipment-history,
   dashboard, fechas inválidas.
4. **Verificación**: check, makemigrations --check, schema --fail-on-warn, suite verde, en vivo.
5. **Commit + memoria**: progreso (Reportes hecho; backend completo → Frontend) + followups.

## Notas
- Sin modelos/migraciones. Solo lectura.
- Reusar `apps.core.permissions.role_required` (restringe también GET, a diferencia de
  RoleWriteOrReadOnly).
- Agregaciones ORM: TruncMonth, Sum(F()*F()), values+annotate+order_by.
