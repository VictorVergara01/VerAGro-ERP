# Spec — Módulo de Reportes Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 9 — Módulo de Reportes (`apps.reports`)

## 1. Contexto y alcance

Noveno sub-proyecto (último backend antes del frontend), sobre `master`. Expone los 6 endpoints
de reportes (doc §7.11) que cubren las 14 métricas mínimas (§5.11). **Solo lectura**: son
agregaciones sobre los módulos ya existentes; sin modelos ni migraciones.

### Dentro del alcance
- 6 endpoints `GET /api/reports/{dashboard,low-stock,service-orders,sales,profit,equipment-history}/`.
- Cobertura de las 14 métricas del doc §5.11 (mapeo en §4).
- Filtro `?from=&to=` opcional (sales/profit/service-orders); dashboard usa mes actual.
- Permisos por sensibilidad (decisión 1a): financieros (dashboard/sales/profit) →
  `role_required("admin","sales")`; operativos (low-stock/service-orders/equipment-history) →
  `IsAuthenticated`.
- Tests TDD + verificación.

### Fuera del alcance (diferido)
- Export a CSV/Excel/PDF → frontend/follow-up.
- Caché de agregaciones / materialización → optimización futura.
- Gráficos (los arma el frontend con estos datos).

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Permisos | Financieros admin+sales (`role_required`); operativos cualquier autenticado | 1a — los reportes financieros exponen datos sensibles. `role_required` restringe también el GET (a diferencia de RoleWriteOrReadOnly, que deja leer a todos). |
| Fechas | `?from=&to=` opcional (sales/profit/service-orders); dashboard = mes actual | 2a. |
| Implementación | `APIView` por reporte (sin router); agregaciones ORM | Read-only, sin recursos CRUD; URLs explícitas del doc §7.11. |
| Sin modelos | El módulo no define modelos ni migraciones | Reusa datos de inventory/service_orders/billing/purchasing. |

## 3. Endpoints

Todos GET, respuesta JSON (dict por reporte). Helper común parsea `?from=&to=` (ISO date;
inválida → 400). `compras por proveedor` se incluye en el dashboard (no hay endpoint propio en §7.11).

### `/api/reports/dashboard/` (admin, sales)
Resumen (métricas acotadas en el tiempo usan el **mes actual**):
- `inventory`: `total_products` (activos), `total_stock_value` (Σ stock*average_cost),
  `low_stock_count`.
- `service_orders_by_status`: dict {status: count}.
- `invoices`: `pending_count`, `pending_amount` (Σ balance_due de issued/partially_paid),
  `sales_this_month` (Σ total emitidas/pagadas del mes).
- `top_customers` (top 5 por nº de órdenes), `top_failing_equipment` (top 5).
- `purchases_by_supplier` (top 5 por Σ grand_total, órdenes no canceladas).

### `/api/reports/low-stock/` (autenticado)
- `summary`: `total_products`, `total_stock_value`.
- `low_stock`: lista de productos con `available_quantity <= minimum_stock` (y `minimum_stock>0`):
  sku, name, stock_quantity, reserved_quantity, available_quantity, minimum_stock.

### `/api/reports/service-orders/` (autenticado, ?from&to)
- `by_status`: dict {status: count}.
- `pending`: count (received/in_diagnostic/quoted/approved/in_progress).
- `waiting_parts`: count.
- `finished_by_technician`: [{technician_id, technician, count}] (finished/invoiced/delivered).
- `most_used_parts`: [{product_id, sku, name, total_quantity}] (ServiceOrderPart status=used), top 10.
- `top_customers`, `top_failing_equipment`: top 10.

### `/api/reports/sales/` (admin, sales, ?from&to)
- `sales_by_month`: [{month: "YYYY-MM", total, count}] (facturas issued/partially_paid/paid).
- `pending_invoices`: [{invoice_number, customer, total, balance_due, status}] (balance_due>0).

### `/api/reports/profit/` (admin, sales, ?from&to)
- `by_invoice`: [{invoice_number, revenue (total), cost (Σ unit_cost*qty), margin (Σ margin_amount)}].
- `by_part`: [{product_id, sku, name, total_quantity, total_margin}] (InvoiceLine con producto).
- `totals`: {revenue, cost, margin}.

### `/api/reports/equipment-history/` (autenticado, ?equipment= requerido)
- 400 si falta `equipment` o no es numérico; 404 si no existe.
- `equipment`: {id, name, serial_number}.
- `service_orders`: [{service_order_number, status, service_type, received_date, finished_date,
  total_amount}] (historial del equipo).

## 4. Mapeo de las 14 métricas (§5.11)
1. Inventario actual → low-stock.summary + dashboard.inventory.
2. Piezas bajo stock mínimo → low-stock.low_stock.
3. Piezas más usadas → service-orders.most_used_parts.
4. Servicios pendientes → service-orders.pending + dashboard.
5. Servicios esperando piezas → service-orders.waiting_parts + dashboard.
6. Servicios finalizados por técnico → service-orders.finished_by_technician.
7. Facturas pendientes de pago → sales.pending_invoices + dashboard.invoices.
8. Ventas por mes → sales.sales_by_month.
9. Ganancia por factura → profit.by_invoice.
10. Ganancia por pieza → profit.by_part.
11. Compras por proveedor → dashboard.purchases_by_supplier.
12. Historial por equipo → equipment-history.
13. Clientes con más servicios → service-orders.top_customers + dashboard.
14. Equipos con más fallas → service-orders.top_failing_equipment + dashboard.

## 5. Implementación
- `apps/reports/views.py`: una `APIView` por reporte; helper `_date_range(request)` →
  (from, to) parseando ISO o 400. Agregaciones ORM:
  - inventario: `aggregate(Sum(F("stock_quantity")*F("average_cost")))`.
  - low stock: `filter(minimum_stock__gt=0).annotate(available=F("stock_quantity")-F("reserved_quantity")).filter(available__lte=F("minimum_stock"))`.
  - ventas por mes: `TruncMonth("issue_date")` + `values` + `annotate(Sum/Count)`.
  - most_used_parts/finished_by_technician/top_*: `values(...).annotate(...).order_by(...)`.
  - profit: anotar facturas con `Sum("lines__margin_amount")` y costo con
    `Sum(F("lines__unit_cost")*F("lines__quantity"))`.
- `apps/reports/urls.py`: paths explícitos §7.11. Incluir en `config/urls.py` bajo `/api/`.
- Permisos: `role_required("admin","sales")` (financieros) / `IsAuthenticated` (operativos).

## 6. Pruebas (TDD)
- **Permisos**: financieros → technician/inventory/readonly 403, admin/sales 200; operativos →
  cualquier autenticado 200, sin auth 401.
- **low-stock**: producto bajo mínimo aparece; uno con stock suficiente no; total_stock_value correcto.
- **service-orders**: by_status cuenta; most_used_parts agrega piezas usadas;
  finished_by_technician agrupa; filtro ?from&to acota.
- **sales**: sales_by_month agrupa por mes facturas emitidas; pending_invoices lista las que tienen
  saldo; ?from&to.
- **profit**: by_invoice (revenue/cost/margin) y by_part (margin por producto) correctos; totals.
- **equipment-history**: lista las órdenes del equipo; falta equipment → 400; inexistente → 404.
- **dashboard**: estructura con las secciones; sales_this_month del mes actual.
- **fechas inválidas** → 400.

## 7. Verificación
- `check` sin issues; `makemigrations --check` sin cambios (no hay modelos); schema OpenAPI válido
  (`--fail-on-warn`).
- Suite completa en verde (213 previos + nuevos).
- En vivo: poblar (orden facturada, venta, low-stock) y consultar los 6 reportes; verificar permisos
  (sales ve profit, technician 403).

## 8. Criterio de aceptación
- Los 6 endpoints responden con las secciones especificadas y cubren las 14 métricas.
- Permisos: financieros solo admin/sales; operativos cualquier autenticado.
- Filtro ?from&to en sales/profit/service-orders; dashboard mes actual; fechas inválidas → 400.
- equipment-history requiere equipment válido.
- OpenAPI documenta; suite en verde.

## 9. Siguientes sub-proyectos
Backend completo. Sigue **Frontend** web (React/Vite) y móvil (React Native/Expo). Ver doc §6.9, §13.
