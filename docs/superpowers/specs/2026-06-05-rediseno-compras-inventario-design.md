# Rediseño compras → inventario: margen en inventario + alta de productos y proveedor desde la OC

Cambio de lógica de negocio pedido por el usuario. El margen de ganancia deja de vivir en la orden de
compra y pasa a Inventario (por producto o por categoría); la OC permite dar de alta productos nuevos y
registra la relación proveedor↔producto al recibir.

## Contexto y motivación

Hoy:
- La línea de OC lleva `margin_percentage`; al **recibir**, `sale_price = landed_unit_cost × (1+margen/100)`
  con ese margen de la línea.
- Las líneas exigen un `Product` ya existente (FK PROTECT) → no se puede "comprar" un producto nuevo.
- `receive_lines` solo **actualiza** `SupplierProduct` si ya existía la relación (no la crea).

El usuario quiere: armar la OC con su proveedor, agregar los productos pedidos (incluidos **nuevos**),
agregar costos → obtener el **costo base** por producto (landed, ya existe), y que el **margen** se
configure en **Inventario** (por categoría o individual), no en la OC.

## A. Margen en inventario (no en la OC)

### Modelos
- **Añadir** `ProductCategory.default_margin_percentage` (`DecimalField(max_digits=12, decimal_places=2,
  default=0)`). `Product.default_margin_percentage` ya existe.
- **Quitar** de `PurchaseOrderLine`: `margin_percentage`, `calculated_sale_price`, `final_sale_price`.
  Se conservan `quantity_ordered`, `quantity_received`, `unit_purchase_cost`, `line_subtotal`,
  `allocated_extra_cost`, `landed_unit_cost`.
- Migraciones: `inventory.000X` (add field) y `purchasing.000X` (remove 3 fields). No hay datos
  productivos → migración destructiva aceptada.

### Helper de margen
Nuevo en `apps/inventory/services.py`:
```python
def effective_margin(product) -> Decimal:
    """Margen efectivo: el del producto si > 0; si no, el de su categoría; si ninguno, 0."""
    if product.default_margin_percentage and product.default_margin_percentage > 0:
        return product.default_margin_percentage
    if product.category_id and product.category and product.category.default_margin_percentage > 0:
        return product.category.default_margin_percentage
    return Decimal("0")
```

### `recalculate_costs` (purchasing)
Deja de calcular margen/precio. Solo:
- `line_subtotal = quantity_ordered × unit_purchase_cost`
- reparte `shipping_cost + Σ additional_costs` proporcional al valor → `allocated_extra_cost`
- `landed_unit_cost = (line_subtotal + allocated_extra_cost) / quantity_ordered`
- totales de la OC (`subtotal_products`, `additional_costs_total`, `grand_total`)
Quita el bloque de `margin_factor`/`calculated_sale_price`/`final_sale_price` y esos campos del
`save(update_fields=...)`.

## B. Precio de venta derivado del margen de inventario

### Al recibir (`receive_lines`)
Tras actualizar `average_cost` (promedio ponderado, sin cambios), fijar:
```python
product.sale_price = _q(line.landed_unit_cost * (Decimal("1") + effective_margin(product) / 100))
```
(en vez de `product.sale_price = line.final_sale_price`). El `update_fields` deja de incluir nada de
la línea para el precio; sigue guardando `sale_price`.

### Al cambiar el margen (recálculo inmediato)
Nuevo servicio `apply_margin(product)` en `apps/inventory/services.py`:
```python
def apply_margin(product):
    product.sale_price = _q(product.average_cost * (Decimal("1") + effective_margin(product) / 100))
    product.save(update_fields=["sale_price", "updated_at"])
```
- **Product**: cuando el serializer/admin guarda un producto y cambió `default_margin_percentage`,
  llamar `apply_margin`. Base = `average_cost` (si es 0, el precio queda 0 hasta la primera recepción).
- **ProductCategory**: cuando se guarda una categoría y cambió su `default_margin_percentage`,
  recalcular `apply_margin` para los productos de esa categoría **sin** margen individual
  (`default_margin_percentage = 0`). Servicio `apply_category_margin(category)`.

(El `sale_price` sigue siendo editable a mano en el form; el recálculo se dispara solo al cambiar el
margen, no a cada guardado.)

## C. Alta de productos nuevos desde la OC

### Serializer de la OC
`PurchaseOrderLineSerializer` (anidado en la creación de la OC) acepta, por línea, **una de dos**:
- `product` (id de un producto existente), **o**
- `new_product`: objeto `{ name (req), category (id, opcional), sku (opcional), unit_of_measure (opcional) }`.

En `create` (o en el create anidado de `PurchaseOrderSerializer`): si la línea no trae `product` pero sí
`new_product`, **crear** el `Product` (`stock_quantity=0`, `is_active=True`, `sku` = el dado o
autogenerado, `average_cost=0`, `sale_price=0`) y enlazar `line.product`. Si no trae ni uno ni otro → 400.

### SKU autogenerado
Si `new_product.sku` viene vacío: generar uno único, p.ej. `SKU-{pk}` tras crear, o un slug del nombre +
sufijo numérico. Debe respetar `unique=True`. (Estrategia simple: crear con un sku temporal único y luego
`SKU-{pk:06d}` si venía vacío, patrón como `order_number`.)

## D. Proveedor↔producto al recibir

En `receive_lines`, por cada línea recibida, reemplazar el `.filter(...).update(last_cost=...)` por:
```python
SupplierProduct.objects.update_or_create(
    supplier_id=purchase_order.supplier_id,
    product_id=line.product_id,
    defaults={"last_cost": line.unit_purchase_cost},
)
if product.main_supplier_id is None:
    product.main_supplier_id = purchase_order.supplier_id
    # se incluye main_supplier en el update_fields del save del producto
```
`SupplierProduct` tiene `unique_together(supplier, product)`, `last_cost`, `currency` (default USD),
`is_preferred`, etc. Solo seteamos `last_cost`; el resto usa sus defaults al crear.

## E. Frontends

### Web — `frontend/`
- `PurchaseOrderCreateModal`: quitar la columna **"Margen %"** de las líneas. Añadir por línea un toggle
  **"Producto existente / Nuevo"**: existente = Select de productos (como hoy); nuevo = inputs `nombre`
  + Select de `categoría` (+ `SKU` opcional). El payload manda `product` o `new_product` por línea.
- `PurchaseOrderDetailPage`: quitar la columna **"Precio venta"** de las líneas (el margen ya no vive en
  la OC); se mantienen costo unit., subtotal, costo asignado, landed.
- Inventario: el form de producto ya tiene "Margen %". Añadir **margen por categoría** en Configuración
  → pestaña Categorías (el `LookupManager`/gestor de categorías expone `default_margin_percentage`).

### Móvil — `mobile/`
- `PurchaseOrderFormModal`: quitar el campo **"Margen %"** de las líneas; añadir el toggle
  existente/nuevo (nombre + Picker de categoría para el nuevo).
- `ProductFormModal`: ya tiene margen (verificar; si no, añadirlo). Gestor de categorías: añadir margen.
  (Móvil no tiene pantalla de categorías como tal; si no existe, queda como follow-up — el margen por
  categoría se gestiona desde el web.)
- Quitar margen del detalle de OC móvil si lo muestra.

## Esquema de tipos regenerado
Tras los cambios de serializers, regenerar `schema.d.ts` en web y móvil (`npm run gen:api` web;
en móvil se copia/gen del esquema). Ajustar los tipos de entrada de las líneas de OC.

## Testing (backend, pytest)
- `effective_margin`: producto con margen → ese; producto 0 + categoría con margen → el de categoría;
  ambos 0 → 0.
- `recalculate_costs`: ya **no** setea `calculated_sale_price`/`final_sale_price` (campos eliminados);
  `landed_unit_cost` correcto (reusar el ejemplo del doc §5.6 sin la parte de margen).
- `receive_lines`: `sale_price` = landed × (1+margen efectivo); crea `SupplierProduct`; asigna
  `main_supplier` si estaba vacío; no lo pisa si ya tenía.
- Alta de producto nuevo desde la OC: crea el `Product` con stock 0 y SKU; la línea queda enlazada;
  al recibir, suma stock.
- `apply_margin` (producto) y `apply_category_margin` (categoría) recalculan `sale_price` desde
  `average_cost`.

## Plan por fases (cada una su commit/verificación)
1. **Backend**: modelos + migraciones + `effective_margin`/`apply_margin`/`apply_category_margin` +
   `recalculate_costs`/`receive_lines` + serializer de OC (producto nuevo) + hooks de margen en
   serializers de producto/categoría + tests. Gate: `pytest apps/inventory apps/purchasing apps/suppliers`.
2. **Web**: regen schema; modal de OC (sin margen, con producto nuevo); detalle OC (sin precio venta);
   margen por categoría en Configuración. Gate: `npm run build` + vitest.
3. **Móvil**: regen schema; `PurchaseOrderFormModal` (sin margen, con producto nuevo); margen de
   categoría si aplica. Gate: `npm run typecheck` + `expo export`.

## Fuera de alcance
- Multimoneda real; devoluciones a proveedor; `allocation_method="manual"` (siguen como están).
- Pantalla nativa de categorías en móvil (si no existe hoy) → el margen por categoría se administra
  desde el web; queda como follow-up.
