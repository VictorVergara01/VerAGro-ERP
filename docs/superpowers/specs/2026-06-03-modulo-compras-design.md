# Spec — Módulo de Compras Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 5 — Módulo de Compras (`apps.purchasing`)

## 1. Contexto y alcance

Quinto sub-proyecto, sobre `master` (fundación + clientes + equipos + inventario +
proveedores). Implementa órdenes de compra con **costeo proporcional landed-cost** (doc §5.6) y
la **recepción** que alimenta inventario: movimientos `purchase_in`, stock, costo promedio
ponderado y precio de venta (doc §6.2). Es el núcleo de valor del MVP3.

### Dentro del alcance
- Modelos `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseAdditionalCost` (doc §5.6).
- Servicio de **costeo** (`recalculate_costs`): distribución proporcional por valor de línea,
  `landed_unit_cost`, precio de venta sugerido.
- Servicio de **recepción** (`receive_lines`): recepción **parcial por línea**, atómica,
  crea `purchase_in`, actualiza stock + `average_cost` (**promedio ponderado móvil**) +
  `last_purchase_cost` + `sale_price` del producto, y transiciona el estado de la orden.
- API CRUD de órdenes (creación con líneas y costos anidados), gestión de líneas y costos,
  acciones `recalculate` / `send` / `receive` / `cancel`.
- Conectar el placeholder `/api/suppliers/{id}/purchase-history/` con datos reales.
- Permisos `RoleWriteOrReadOnly("admin","inventory")`.
- Tests TDD + verificación en vivo.

### Fuera del alcance (diferido)
- `allocation_method = "manual"` por costo adicional: el campo existe, pero solo se implementa
  `proportional_by_value` (regla por defecto del doc). Manual → follow-up.
- Multimoneda real (conversión FX): `currency` es informativo; el costeo asume una sola moneda.
- Devoluciones a proveedor / notas de crédito.
- Frontend.

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Recepción | **Parcial por línea**, idempotente vía `quantity_received` acumulado | Fiel al doc (`partially_received`); realista para importaciones en varias entregas. |
| Costo del producto al recibir | **Promedio ponderado móvil** sobre `average_cost`; `last_purchase_cost = landed_unit_cost` | Refleja el costo real acumulado del inventario, no solo la última compra. |
| Precio de venta al recibir | `Product.sale_price = line.final_sale_price` | Doc §6.2 paso 14; el usuario ya ajustó el precio final antes de confirmar. |
| Distribución de costos | Proporcional al valor de línea (`line_subtotal / products_subtotal`) | Regla por defecto del doc §5.6. |
| Residuo de redondeo | Se asigna a la **última línea** para que Σ allocated == additional_total exacto | Evita centavos perdidos por `quantize`. |
| `order_number` | Autogenerado `OC-NNNNNN` (desde pk) si viene vacío; unique; override manual | Sin fricción al crear; trazable. |
| on_delete | Line/AdditionalCost → CASCADE (hijos de la orden). PO.supplier → PROTECT. Line.product → PROTECT. | La orden agrupa sus líneas; no se borra proveedor/producto con historial de compra. |
| Enlace a inventario | `InventoryMovement.reference_type="purchase_order"`, `reference_id=po.id` | Reusa los campos existentes; sin FK cruzada ni migración en inventory. |
| Edición de líneas/costos | Solo en estado `draft` o `sent` | Tras recibir, los números quedan congelados (integridad del costeo). |
| Permisos | `RoleWriteOrReadOnly("admin","inventory")` | Dominio de inventario/compras (doc §5.1). Lectura para todo autenticado. |

## 3. Modelos (`backend/apps/purchasing/models.py`, todos TimeStampedModel)

### PurchaseOrder
- `supplier` FK→suppliers.Supplier on_delete=PROTECT, related_name="purchase_orders"
- `order_number` CharField(30) unique, blank (autogenerado `OC-{pk:06d}` en save si vacío)
- `status` CharField(30) choices=[draft, sent, partially_received, received, cancelled], default `draft`
- `order_date` DateField (default hoy)
- `expected_date` DateField null=True, blank=True
- `currency` CharField(10) default "USD"
- `subtotal_products` Decimal(14,2) default 0 *(derivado)*
- `shipping_cost` Decimal(14,2) default 0 *(input)*
- `additional_costs_total` Decimal(14,2) default 0 *(derivado = Σ additional_costs.amount)*
- `grand_total` Decimal(14,2) default 0 *(derivado = subtotal_products + shipping_cost + additional_costs_total)*
- `notes` TextField blank
- `created_by` FK→users.User on_delete=SET_NULL null/blank
- Meta.ordering=("-created_at",); __str__→order_number

### PurchaseOrderLine
- `purchase_order` FK→PurchaseOrder on_delete=CASCADE related_name="lines"
- `product` FK→inventory.Product on_delete=PROTECT related_name="purchase_lines"
- `quantity_ordered` Decimal(12,2)
- `quantity_received` Decimal(12,2) default 0
- `unit_purchase_cost` Decimal(12,2)
- `line_subtotal` Decimal(14,2) default 0 *(derivado = quantity_ordered * unit_purchase_cost)*
- `allocated_extra_cost` Decimal(14,2) default 0 *(derivado)*
- `landed_unit_cost` Decimal(14,4) default 0 *(derivado; 4 decimales para no perder precisión unitaria)*
- `margin_percentage` Decimal(12,2) default 0 *(input; default desde product.default_margin_percentage al crear)*
- `calculated_sale_price` Decimal(14,2) default 0 *(derivado = landed_unit_cost * (1 + margin/100))*
- `final_sale_price` Decimal(14,2) default 0 *(input; default = calculated_sale_price)*
- Meta.ordering=("id",); __str__→f"{product} x{quantity_ordered}"

### PurchaseAdditionalCost
- `purchase_order` FK→PurchaseOrder on_delete=CASCADE related_name="additional_costs"
- `name` CharField(255)
- `amount` Decimal(14,2)
- `allocation_method` CharField(30) choices=[proportional_by_value, manual], default `proportional_by_value`
- `notes` TextField blank
- Meta.ordering=("id",); __str__→f"{name}: {amount}"

### Migraciones
- `purchasing.0001` crea los 3 modelos. Depende de `suppliers.0001`, `inventory.0001`, `users`.
- **No** modifica otras apps (el enlace a inventario usa `reference_type/reference_id`, no FK).

## 4. Servicios (`backend/apps/purchasing/services.py`)

Decimal en todo; `quantize(Decimal("0.01"), ROUND_HALF_UP)` para montos, `0.0001` para
`landed_unit_cost`. `getcontext` no se toca; se usa quantize explícito.

### `recalculate_costs(purchase_order)` → PurchaseOrder
Recalcula derivados de todas las líneas y los totales de la orden (doc §5.6):
```
line_subtotal      = quantity_ordered * unit_purchase_cost          (por línea)
products_subtotal  = Σ line_subtotal
additional_total   = shipping_cost + Σ additional_costs.amount
ratio              = line_subtotal / products_subtotal              (0 si products_subtotal==0)
allocated_extra    = additional_total * ratio                       (quantize 0.01)
landed_total       = line_subtotal + allocated_extra
landed_unit_cost   = landed_total / quantity_ordered                (0 si qty==0; quantize 0.0001)
calculated_sale_price = landed_unit_cost * (1 + margin_percentage/100)   (quantize 0.01)
```
- **Residuo de redondeo**: tras quantizar todos los `allocated_extra`, la diferencia con
  `additional_total` se suma a la última línea, de modo que Σ allocated == additional_total.
- `final_sale_price`: si es 0 (no fijado por el usuario) se setea = `calculated_sale_price`;
  si ya tiene valor manual, **se respeta**.
- Totales de la orden: `subtotal_products`, `additional_costs_total`, `grand_total`.
- Guarda líneas (`update_fields` de derivados) y la orden. No cambia `status`.
- Se invoca tras crear/editar/borrar líneas o costos y tras la acción `recalculate`.

### `receive_lines(*, purchase_order, receipts, user)` → PurchaseOrder
`receipts` = lista de `{"line": <id>, "quantity": <Decimal>}`. Atómico (`transaction.atomic`,
`select_for_update` sobre productos):
1. Estado de la orden debe ser `sent` o `partially_received` (si no → ValidationError).
2. `recalculate_costs` primero (garantiza `landed_unit_cost`/`final_sale_price` vigentes).
3. Por cada receipt: validar que la línea pertenece a la orden, `quantity > 0`, y
   `quantity_received + quantity <= quantity_ordered` (sin sobre-recepción → ValidationError).
4. Por cada línea recibida (cantidad `q`, `c = landed_unit_cost`):
   - Crea `InventoryMovement(purchase_in, quantity=q, unit_cost=c,
     reference_type="purchase_order", reference_id=po.id, created_by=user)`.
   - Producto (locked): `average_cost = (stock*avg + q*c)/(stock+q)` (si stock+q>0; quantize 0.01),
     `last_purchase_cost = c`, `sale_price = line.final_sale_price`, `stock_quantity += q`.
     `save(update_fields=[...])` incluyendo `updated_at`.
   - Si existe `SupplierProduct(supplier=po.supplier, product=line.product)`: actualiza su
     `last_cost = line.unit_purchase_cost` (cierra el lazo con Proveedores; no crea si no existe).
   - `line.quantity_received += q`; save.
5. Estado de la orden: si **todas** las líneas tienen `quantity_received == quantity_ordered`
   → `received`; si alguna recibida parcial/total pero no todas completas → `partially_received`.
6. Retorna la orden.

Helper de la acción API `receive_all`: arma `receipts` con el faltante de cada línea.

## 5. Permisos
`RoleWriteOrReadOnly("admin","inventory")` en los tres ViewSets y en las acciones de escritura
(`recalculate`, `send`, `receive`, `cancel`). Lectura (GET, purchase-history) para cualquier
autenticado.

## 6. API (SimpleRouter, incluida en `config/urls.py` bajo `/api/`)

### PurchaseOrderViewSet → `/api/purchase-orders/`
- CRUD. **Creación con anidados**: POST acepta `lines` y `additional_costs` anidados
  (writable nested) y dispara `recalculate_costs`. `created_by` desde request.user.
- `get_queryset`: `select_related("supplier")`, `prefetch_related("lines","additional_costs")`.
- Filtros query: `?supplier=` (400 si no numérico), `?status=` (lista vacía si status inválido).
- `SearchFilter`: `order_number`, `notes`.
- Edición de la orden y de sus anidados solo en `draft`/`sent` (si no → 400).
- Acciones (POST):
  - `recalculate` → recomputa y devuelve la orden.
  - `send` → `draft`→`sent` (otro estado → 400).
  - `receive` → body `{"receipts":[{"line":id,"quantity":n}]}` **o** `{"receive_all":true}`;
    llama `receive_lines`; devuelve la orden con estado/recepción actualizados.
  - `cancel` → `status=cancelled` salvo que ya esté `received`/`cancelled` (→400).
- `perform_destroy`: borrado real (las órdenes draft pueden eliminarse; no hay soft-delete de
  compras — el historial relevante es el inventario ya recibido, que persiste vía movimientos).
  *(Alternativa considerada: bloquear DELETE si status != draft → se valida en `perform_destroy`.)*

### PurchaseOrderLineViewSet → `/api/purchase-order-lines/`
- CRUD; filtro `?purchase_order=` (400 si no numérico). Solo editable si la orden está en
  `draft`/`sent`. Tras create/update/delete → `recalculate_costs(parent)`.
- `margin_percentage` default desde `product.default_margin_percentage` si no se envía.

### PurchaseAdditionalCostViewSet → `/api/purchase-additional-costs/`
- CRUD; filtro `?purchase_order=`. Solo editable si la orden está en `draft`/`sent`.
  Tras create/update/delete → `recalculate_costs(parent)`.

### Suppliers (conexión del placeholder)
- `/api/suppliers/{id}/purchase-history/`: ahora devuelve las `PurchaseOrder` del proveedor
  (paginadas, serializer resumido). Cierra el follow-up #13.

## 7. Serializers
- `PurchaseAdditionalCostSerializer`: ModelSerializer; `purchase_order` read-only en el contexto
  anidado / requerido en el endpoint directo.
- `PurchaseOrderLineSerializer`: campos de input (`product`, `quantity_ordered`,
  `unit_purchase_cost`, `margin_percentage`, `final_sale_price`) + derivados read-only
  (`line_subtotal`, `allocated_extra_cost`, `landed_unit_cost`, `calculated_sale_price`,
  `quantity_received`) + `product_sku`/`product_name` read-only. Valida `quantity_ordered>0`,
  `unit_purchase_cost>=0`.
- `PurchaseOrderSerializer`: `lines` y `additional_costs` anidados (read siempre; write en
  create). Derivados (`subtotal_products`, `additional_costs_total`, `grand_total`, `status`)
  read-only. `create` atómico: crea orden + anidados + `recalculate_costs`.
- `PurchaseOrderSummarySerializer`: para purchase-history (order_number, status, order_date,
  grand_total, currency).

## 8. Pruebas (TDD)
- **Modelos** (`tests/test_models.py`): `order_number` autogenerado y unique; status default
  `draft`; relaciones lines/additional_costs (CASCADE); __str__.
- **Costeo** (`tests/test_services.py`): **el ejemplo del doc §5.6** (Hélice/Flow Meter/Bomba,
  subtotal 390, adicional 100 → allocated 46.15/23.08/30.77, landed 22.62/56.54/150.77);
  `products_subtotal==0` no divide por cero; residuo de redondeo (Σ allocated == additional_total);
  `final_sale_price` manual se respeta; `calculated_sale_price` con margen.
- **Recepción** (`tests/test_services.py`): recepción parcial crea `purchase_in` y deja
  `partially_received`; completar → `received`; stock sube; `average_cost` ponderado correcto
  (caso con stock previo); `last_purchase_cost`/`sale_price` actualizados; sobre-recepción →
  ValidationError; recepción desde estado inválido → error; `SupplierProduct.last_cost`
  actualizado si la relación existe.
- **API** (`tests/test_api.py`): crear orden con líneas+costos anidados (201, derivados
  calculados); `recalculate`; `send`; `receive` (parcial y `receive_all`); `cancel`; editar
  línea recalcula la orden; editar tras `received` → 400; filtros `?supplier=`/`?status=`
  (no numérico → 400); búsqueda por order_number; permisos (401 sin auth, technician 403,
  readonly 403, inventory 201); purchase-history del proveedor devuelve las órdenes.

## 9. Verificación
- `makemigrations purchasing` creada y committeada; `migrate` limpio; `manage.py check` sin
  issues; `makemigrations --check` sin cambios.
- Suite completa en verde (113 previos + nuevos de compras).
- En vivo (docker compose): crear orden con 3 líneas + envío/adicionales, ver costeo del
  ejemplo del doc, `send`, `receive_all`, comprobar en inventario stock/average_cost/sale_price
  y los movimientos `purchase_in`, purchase-history del proveedor, docs Swagger.

## 10. Criterio de aceptación
- Costeo proporcional reproduce **exactamente** el ejemplo del doc §5.6.
- Recepción parcial y total actualizan inventario (stock, promedio ponderado, last_cost,
  sale_price) y crean movimientos `purchase_in` enlazados a la orden.
- Estados transicionan correctamente (draft→sent→partially_received→received; cancel).
- Edición bloqueada tras recepción; sin sobre-recepción.
- Permisos por rol (admin/inventory escriben; resto lee).
- `/suppliers/{id}/purchase-history/` devuelve órdenes reales.
- OpenAPI documenta los endpoints; suite en verde.

## 11. Siguientes sub-proyectos
Órdenes de Servicio (reserve/deduct de inventario, consume `service_out`) → Checklists →
Cotizaciones/Facturación → Reportes → Frontend. Ver doc §13.
