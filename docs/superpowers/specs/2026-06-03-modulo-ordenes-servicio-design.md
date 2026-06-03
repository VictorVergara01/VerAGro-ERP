# Spec — Módulo de Órdenes de Servicio Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 6 — Módulo de Órdenes de Servicio (`apps.service_orders`)

## 1. Contexto y alcance

Sexto sub-proyecto, sobre `master` (fundación + clientes + equipos + inventario + proveedores +
compras). Implementa órdenes de servicio/mantenimiento (doc §5.7, flujo §6.1, API §7.7) y el
**núcleo de reserva/descuento de inventario** (movimientos `reservation`,
`reservation_release`, `service_out`). Conecta los historiales de servicio de cliente y equipo
hoy en placeholder.

### Dentro del alcance
- Modelos `ServiceOrder` y `ServiceOrderPart` (doc §5.7).
- **Servicios de inventario** nuevos en `apps.inventory.services`: `reserve_stock`,
  `release_reservation`, `consume_stock` (atómicos, con `select_for_update`).
- Servicio del módulo: `recalculate_totals(order)`.
- Máquina de estados vía acciones: `start-diagnostic`, `approve`, `start-work`,
  `reserve-parts`, `finish`, `deliver`, `cancel`.
- Ciclo de vida de piezas: reserva **explícita** (reserve-parts); `finish` consume las
  **reservadas → usadas** (`service_out`).
- API CRUD de órdenes + gestión de piezas (`add-part` + `/api/service-order-parts/`).
- Conectar `/api/customers/{id}/service-orders/` y `/api/equipment/{id}/service-history/` con
  datos reales (paginados → cierra follow-up #5 para estos dos).
- **Endurecer** `inventory.services.apply_adjustment` (`adjustment_out`) contra
  `available_quantity` en vez de `stock_quantity` (follow-up #11).
- Permisos `RoleWriteOrReadOnly("admin","technician")`.
- Tests TDD + verificación en vivo.

### Fuera del alcance (diferido)
- **Checklists** (doc §5.8) → sub-proyecto 7.
- **Cotizaciones / Facturación** (doc §5.9) → sub-proyecto 8. `generate-quote` y
  `generate-invoice` se exponen como stubs `501 Not Implemented` para reservar la ruta.
- Solicitud de compra automática desde piezas `pending_purchase` (enlaza con purchasing) →
  follow-up.
- Fotos / adjuntos y endpoints `/api/mobile/...` → frontend/MVP móvil.
- `/api/customers/{id}/equipment/` e `/invoices/` siguen placeholder (equipment/billing).

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Reserva de stock | **Explícita** vía `reserve-parts` | Fiel al doc §7.7 (acción dedicada); `add-part` no toca inventario. |
| Consumo en `finish` | Las piezas `reserved` → `used` (`service_out`, stock−=q, reserved−=q) | Lo reservado para el trabajo se consume; un solo paso claro (doc §5.7 reglas). |
| Permisos | `RoleWriteOrReadOnly("admin","technician")` | Doc §5.1: técnicos crean diagnósticos/piezas. Resto solo lee. |
| Dónde vive la reserva | Servicios en `apps.inventory.services` (invariantes de stock en inventario) | El módulo de servicio orquesta; inventario garantiza no-negativos y movimientos. |
| `adjustment_out` | Validar contra `available_quantity` | Cierra follow-up #11: evita ajustar stock ya reservado. |
| `equipment` en la orden | FK nullable (PROTECT) | Permite diagnósticos sin equipo registrado; normalmente se setea. |
| on_delete | Part→ServiceOrder CASCADE; ServiceOrder→customer/equipment PROTECT; Part→product PROTECT | La orden agrupa sus piezas; no se borra cliente/equipo/producto con historial. |
| `service_order_number` | Autogenerado `OS-NNNNNN` (desde pk) si vacío; unique | Igual que compras (`OC-`). |
| Edición de piezas | Solo si la orden no está en estado terminal (finished/invoiced/delivered/cancelled) y la pieza está en `required`/`pending_purchase`; piezas `reserved` se liberan al borrarlas | Integridad de inventario tras reservar/consumir. |

## 3. Modelos (`backend/apps/service_orders/models.py`, TimeStampedModel)

### ServiceOrder
- `service_order_number` CharField(30) unique, blank (autogenerado `OS-{pk:06d}`)
- `customer` FK→customers.Customer PROTECT related_name="service_orders"
- `equipment` FK→equipment.Equipment PROTECT null=True blank=True related_name="service_orders"
- `service_type` CharField(30) choices=[diagnostic, preventive_maintenance,
  corrective_maintenance, repair, cleaning, calibration, other], default `diagnostic`
- `status` CharField(30) choices=[received, in_diagnostic, quoted, approved, in_progress,
  waiting_parts, finished, invoiced, delivered, cancelled], default `received`
- `received_date` DateField default hoy
- `estimated_delivery_date` DateField null/blank
- `finished_date` DateField null/blank; `delivered_date` DateField null/blank
- `technician` FK→users.User SET_NULL null/blank related_name="service_orders_as_technician"
- `customer_complaint`, `diagnostic_summary`, `technical_notes`, `internal_notes` TextField blank
- `labor_cost`, `diagnostic_fee`, `discount_amount`, `tax_amount` Decimal(12,2) default 0
- `total_amount` Decimal(14,2) default 0 *(derivado)*
- `created_by` FK→users.User SET_NULL null/blank related_name="+"
- Meta.ordering=("-created_at",); __str__→service_order_number

### ServiceOrderPart
- `service_order` FK→ServiceOrder CASCADE related_name="parts"
- `product` FK→inventory.Product PROTECT related_name="service_parts"
- `quantity` Decimal(12,2)
- `unit_cost` Decimal(12,2) default 0 *(default = product.average_cost al crear)*
- `unit_price` Decimal(12,2) default 0 *(default = product.sale_price al crear)*
- `total_price` Decimal(14,2) default 0 *(derivado = quantity * unit_price)*
- `status` CharField(20) choices=[required, reserved, used, pending_purchase, returned],
  default `required`
- `notes` TextField blank
- Meta.ordering=("id",); __str__→f"{product} x{quantity} ({status})"

### Migración
`service_orders.0001` crea ambos modelos. Depende de `customers`, `equipment`, `inventory`,
`users`. No modifica otras apps.

## 4. Servicios

### Inventario (`apps.inventory.services`, nuevos)
Todos atómicos (`transaction.atomic` + `select_for_update`), Decimal, `update_fields` con
`updated_at`. `reference_type`/`reference_id` para enlazar (p.ej. "service_order").
- `reserve_stock(*, product, quantity, reference_type="", reference_id=None, notes="", user=None)`:
  valida `quantity>0` y `quantity <= available_quantity` (→ ValidationError si no alcanza);
  `reserved_quantity += quantity`; crea movimiento `reservation`.
- `release_reservation(*, product, quantity, ...)`: `quantity>0`; `reserved_quantity -= quantity`
  (no baja de 0); crea `reservation_release`.
- `consume_stock(*, product, quantity, was_reserved=False, unit_cost=0, ...)`: `quantity>0`;
  `stock_quantity -= quantity` (guard no-negativo sobre stock); si `was_reserved`,
  `reserved_quantity -= quantity` (no baja de 0); crea `service_out`.
- **Endurecer** `apply_adjustment`: `adjustment_out` valida contra `available_quantity`
  (antes `stock_quantity`).

### Módulo (`apps.service_orders.services`)
- `recalculate_totals(order)`: `parts_subtotal = Σ total_price` de piezas con `status != returned`;
  `total_amount = labor_cost + diagnostic_fee + parts_subtotal - discount_amount + tax_amount`
  (quantize 0.01). Guarda la orden. Se llama tras cambios en piezas o en costos.
- `reserve_parts(order, user)`: por cada pieza `required`: si `available_quantity >= quantity`
  → `reserve_stock(...)` y `status=reserved`; si no → `status=pending_purchase`. Devuelve resumen
  `{reserved: [...], pending: [...]}`. Si queda alguna `pending_purchase`, la orden pasa a
  `waiting_parts`.
- `finish_order(order, user)`: requiere `status=in_progress`; por cada pieza `reserved`:
  `consume_stock(..., was_reserved=True, unit_cost=part.unit_cost)` y `status=used`;
  `status=finished`, `finished_date=hoy`; recalcula totales.
- `cancel_order(order, user)`: por cada pieza `reserved`: `release_reservation(...)` y
  `status=returned`; `status=cancelled`. No permitido si ya `delivered`.

## 5. Permisos
`RoleWriteOrReadOnly("admin","technician")` en `ServiceOrderViewSet` (+ acciones de escritura) y
`ServiceOrderPartViewSet`. Lectura (GET, historiales) para cualquier autenticado. Las acciones
de historial viven en customers/equipment y heredan su permiso de lectura.

## 6. API (SimpleRouter, en `config/urls.py` bajo `/api/`)

### ServiceOrderViewSet → `/api/service-orders/`
- CRUD. `create`: `created_by`/`technician` razonables; sin piezas anidadas obligatorias
  (se agregan luego con `add-part`). Edición de la orden bloqueada en estados terminales.
- `get_queryset`: `select_related("customer","equipment","technician")`,
  `prefetch_related("parts")`. Filtros `?customer=`, `?equipment=`, `?status=`, `?technician=`
  (ids → 400 si no numéricos). `SearchFilter`: `service_order_number`, `customer_complaint`.
- Acciones (POST):
  - `start-diagnostic`: received → in_diagnostic.
  - `approve`: in_diagnostic/quoted → approved.
  - `start-work`: approved/waiting_parts → in_progress.
  - `add-part`: body `{product, quantity, unit_cost?, unit_price?, notes?}`; crea pieza
    (`required`, defaults de costo/precio desde el producto); recalcula totales.
  - `reserve-parts`: ejecuta `services.reserve_parts`; devuelve resumen.
  - `finish`: ejecuta `services.finish_order`.
  - `deliver`: finished/invoiced → delivered; `delivered_date=hoy`.
  - `cancel`: ejecuta `services.cancel_order` (libera reservas).
  - `generate-quote`, `generate-invoice`: **stub 501** (módulos diferidos).

### ServiceOrderPartViewSet → `/api/service-order-parts/`
- CRUD; filtro `?service_order=` (→400 si no numérico). `create`/`update` solo con la orden en
  estado no terminal; `update`/`delete` de pieza solo si `status in (required, pending_purchase)`,
  **salvo** `delete` de una pieza `reserved` (libera la reserva y luego borra). Recalcula totales
  tras cada cambio.

### Conexión de historiales (reemplazo de placeholders)
- `customers.views`: `/api/customers/{id}/service-orders/` → órdenes del cliente (paginadas,
  summary serializer).
- `equipment.views`: `/api/equipment/{id}/service-history/` → órdenes del equipo (paginadas).

## 7. Serializers
- `ServiceOrderPartSerializer`: input (`product`, `quantity`, `unit_cost?`, `unit_price?`,
  `notes`) + derivados/estado read-only (`total_price`, `status`) + `product_sku`/`product_name`.
  Defaults de `unit_cost`/`unit_price` desde el producto si no se envían. Valida `quantity>0`.
- `ServiceOrderSerializer`: campos de la orden; `parts` anidado read-only; derivados read-only
  (`service_order_number`, `status`, `total_amount`, fechas de finish/deliver, `created_by`);
  `customer_name`/`equipment_name`/`technician_name` read-only.
- `ServiceOrderSummarySerializer`: para historiales (number, status, service_type, fechas, total).

## 8. Pruebas (TDD)
- **Inventario (servicios)** (`apps/inventory/tests`): `reserve_stock` sube reserved y crea
  `reservation`; reserva > disponible → ValidationError; `release_reservation` baja reserved y no
  por debajo de 0; `consume_stock` (con/ sin was_reserved) baja stock/reserved y crea
  `service_out`; `adjustment_out` ahora bloquea contra `available_quantity` (stock 10, reserved 8,
  ajustar 5 → error).
- **Modelos**: `service_order_number` autogenerado/unique; status default `received`; CASCADE de
  piezas; __str__.
- **Servicios del módulo** (`tests/test_services.py`): `recalculate_totals` (labor+fee+piezas
  −desc+tax, ignora returned); `reserve_parts` (reserva disponibles, marca pending sin stock,
  pasa a waiting_parts); `finish_order` consume reservadas → used, baja stock/reserved, crea
  service_out, status finished; `cancel_order` libera reservas → returned, reservation_release.
- **API** (`tests/test_api.py`): crear orden (201, number OS-); transiciones
  start-diagnostic/approve/start-work/finish/deliver; add-part recalcula total; reserve-parts
  (resumen reserved/pending); finish descuenta inventario y deja stock correcto; cancel libera;
  filtros (`?customer=`/`?status=` etc., no numérico → 400); búsqueda; permisos (401 sin auth,
  sales/readonly/inventory 403 en escritura, technician 201, admin 201); stubs quote/invoice → 501;
  borrar pieza reserved libera reserva. Historiales: customer/equipment devuelven las órdenes.

## 9. Verificación
- `makemigrations service_orders` creada/committeada; `migrate` limpio; `check` sin issues;
  `makemigrations --check` sin cambios; schema OpenAPI válido (`--fail-on-warn`).
- Suite completa en verde (138 previos + nuevos).
- En vivo (docker compose): crear cliente/equipo/orden, add-part, reserve-parts (ver
  reserved_quantity en inventario y movimiento `reservation`), start-work, finish (ver stock
  bajar y `service_out`), historiales de cliente y equipo, docs Swagger.

## 10. Criterio de aceptación
- Orden de servicio con ciclo de estados (received→…→delivered; cancel).
- Reserva explícita: piezas con stock → reserved (+reserved_quantity, movimiento reservation);
  sin stock → pending_purchase.
- `finish` consume reservadas → used (`service_out`, stock y reserved bajan); `cancel` libera.
- `adjustment_out` endurecido contra `available_quantity` (cierra follow-up #11).
- Historiales de cliente y equipo devuelven órdenes reales (paginadas).
- Permisos por rol (admin/technician escriben; resto lee).
- OpenAPI documenta los endpoints; suite en verde.

## 11. Siguientes sub-proyectos
Checklists (§5.8) → Cotizaciones/Facturación (§5.9, implementa generate-quote/invoice y descuento
de factura) → Reportes → Frontend. Ver doc §13.
