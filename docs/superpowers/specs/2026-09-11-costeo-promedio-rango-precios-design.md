# Costeo promedio ponderado, rango de precio de venta e historial de costos

**Fecha:** 2026-09-11
**Rama:** V3.0
**Estado:** Spec para revisión (antes del plan por etapas)

## Problema

El costo promedio ponderado **ya está implementado** y funciona: `Product.average_cost` se
recalcula en cada recepción de compra (`apps/purchasing/services.py`, dentro de `receive_lines`).
Lo que está roto es el **precio de venta**, que se deriva del costo *landed de esa compra*
en vez del promedio acumulado.

`apps/purchasing/services.py:143`:

```python
margin = effective_margin(product)
product.sale_price = _q(cost * (Decimal("1") + margin / Decimal("100")))
#                       ^^^^ landed de ESTA compra, no average_cost
```

Mientras que `apps/inventory/services.py:58` (`apply_margin`) hace lo correcto:

```python
product.sale_price = _q(product.average_cost * (Decimal("1") + margin / Decimal("100")))
```

Son dos caminos que no coinciden. El efecto es que el precio de venta salta con el flete de
la última compra, y se "corrige" solo si alguien edita el margen del producto.

### Evidencia

Simulación con el código real (10 hélices @ $20 y 4 motores @ $50, margen de categoría 30%,
dos compras idénticas salvo el flete):

| | Compra 1 (flete $100) | Compra 2 (flete $200) |
|---|---|---|
| Hélice — landed de esa compra | 25.0000 | 30.0000 |
| Hélice — `average_cost` | 25.00 | **27.50** (correcto) |
| Hélice — `sale_price` | 32.50 | **39.00** (debería ser 35.75) |

El promedio es correcto: 27.50 es el ponderado exacto de 10@25 y 10@30.
El precio no: usa 30.00 en vez de 27.50.

### Problemas relacionados encontrados

1. **`apply_adjustment()` no alimenta el promedio.** `apps/inventory/services.py:77` mueve
   `stock_quantity` pero nunca `average_cost`. En la base actual **no existe ningún movimiento
   `purchase_in`**: los 56 productos con costo lo recibieron por `adjustment_in`. Es decir, en
   la práctica el promedio nunca se ha ejercitado.
2. **La matemática del promedio vive dentro de `receive_lines()`**, acoplada al flujo de compras.
   No hay una función reutilizable.
3. **El historial no guarda el promedio resultante.** `InventoryMovement` registra `unit_cost`
   pero no el `average_cost` que quedó después del movimiento, así que la evolución del costo
   no se puede reconstruir.
4. **`InventoryMovement.unit_cost` tiene 2 decimales** mientras `PurchaseOrderLine.landed_unit_cost`
   tiene 4. El historial redondea el landed y pierde precisión en piezas baratas con flete prorrateado.
5. **No existe rango de precio.** Sólo hay un `sale_price` único por producto.

## Objetivos

1. Que el **precio de venta se derive siempre del costo promedio ponderado**, con una única
   implementación compartida entre compras e inventario.
2. Un **rango de precio de venta** por producto (piso / sugerido / techo) derivado de tres
   márgenes, con la misma cascada producto → categoría que ya existe.
3. Que el **ajuste positivo de stock alimente el promedio**, con costo unitario obligatorio.
4. Un **historial de costos por producto**: qué costó en cada compra (desglosado en costo del
   proveedor y flete prorrateado) y cómo quedó el promedio después de cada entrada.
5. **Avisar sin bloquear** cuando se vende por debajo del piso, y poder reportarlo.

## No objetivos (YAGNI)

- No se cambia el método de costeo a FIFO/LIFO ni se introducen lotes. Sigue siendo promedio móvil ponderado.
- No se toca la lógica atómica de stock (`select_for_update` + `transaction.atomic`) más allá de
  añadir la actualización del promedio dentro de las transacciones que ya existen.
- No se congela el rango histórico en las líneas de venta (ver "Decisiones tomadas").
- No se toca `last_purchase_cost`: es el último costo por definición y sirve para ver la
  desviación contra el promedio.
- No se implementa nada de esto en la app móvil en esta fase.
- No se toca el módulo de equipos (es el otro sub-proyecto, va después).

## Decisiones tomadas

| Decisión | Elegido | Razón |
|---|---|---|
| Forma del rango | Dos márgenes (mínimo y máximo) | El rango se reajusta solo cuando sube el costo promedio; no hay que mantener precios a mano |
| Venta fuera de rango | Avisar, no bloquear | No traba una venta por un descuento puntual; queda el reporte |
| Ajuste positivo | Costo unitario **obligatorio**, entra al promedio | Es la única forma de que el promedio sea confiable si se carga mercancía por ajuste |
| Desglose del historial | FK directo a `PurchaseOrderLine` | Exacto aun si una orden repite el mismo producto en dos líneas con precios distintos |
| Rango en líneas de venta | Calculado contra el rango **vigente**, no congelado | Sin columnas nuevas en tres modelos; muestra qué está bajo el costo *hoy* |
| Datos de prueba | Se eliminan | Los 57 productos `SKU-*` eran de prueba; no hace falta backfill de precios |

## Modelo de datos

### `inventory.ProductCategory` — campos nuevos

- `min_margin_percentage` — `DecimalField(max_digits=12, decimal_places=2, default=0)`
- `max_margin_percentage` — `DecimalField(max_digits=12, decimal_places=2, default=0)`

El `default_margin_percentage` existente se mantiene y pasa a leerse como **margen objetivo**.

### `inventory.Product` — campos nuevos

- `min_margin_percentage` — `DecimalField(max_digits=12, decimal_places=2, default=0)`
- `max_margin_percentage` — `DecimalField(max_digits=12, decimal_places=2, default=0)`
- `min_sale_price` — `DecimalField(max_digits=12, decimal_places=2, default=0)`
- `max_sale_price` — `DecimalField(max_digits=12, decimal_places=2, default=0)`

`min_sale_price` / `max_sale_price` se **denormalizan** (se guardan, no se calculan al vuelo)
para poder filtrar en SQL: es lo que hace posible el reporte de ventas bajo el piso sin
recorrer producto por producto.

**Validación** (en `Product.clean()` y en el serializer): si `min` y `max` son ambos > 0,
entonces `min <= default <= max`. Un margen en 0 significa "no configurado" y hereda de la
categoría, igual que hoy.

### `inventory.InventoryMovement` — cambios

- `unit_cost` — pasa de `decimal_places=2` a `decimal_places=4` (`max_digits=14`). Ampliar
  precisión es una migración segura, no pierde datos.
- `average_cost_after` — `DecimalField(max_digits=12, decimal_places=2, default=0)`, nuevo.
  Lo escribe `apply_weighted_average()`.
- `purchase_order_line` — `FK("purchasing.PurchaseOrderLine", on_delete=SET_NULL, null=True,
  blank=True, related_name="movements")`, nuevo. Lo llena `receive_lines()`.

Se conservan `reference_type` / `reference_id` tal como están: los usan otros flujos
(órdenes de servicio, trabajos de campo) y no se tocan.

## Motor de costeo

### `inventory.services.apply_weighted_average(locked_product, quantity_in, unit_cost)`

Nueva función, **único lugar del sistema donde `average_cost` cambia**.

```
nuevo_stock = stock_actual + quantity_in
si nuevo_stock > 0:
    average_cost = (stock_actual * average_cost + quantity_in * unit_cost) / nuevo_stock
```

Recibe un producto ya bloqueado con `select_for_update()` — la función no abre transacción
ni bloquea por su cuenta; es responsabilidad del llamador, que ya lo hace.
Cuantiza a centavos con `ROUND_HALF_UP`, igual que el resto del módulo.
Devuelve el nuevo `average_cost` para que el llamador lo escriba en `average_cost_after`
del movimiento.

Llamadores: `purchasing.services.receive_lines()` y `inventory.services.apply_adjustment()`.

### `inventory.services.effective_margins(product) -> (min, target, max)`

Generaliza el `effective_margin()` actual a los tres márgenes, con la misma cascada:
el del producto si es > 0, si no el de su categoría, si ninguno 0.
`effective_margin()` se conserva como envoltorio del objetivo para no romper llamadores.

### `inventory.services.apply_margin(product)` — se extiende

Pasa a calcular los tres valores sobre `average_cost`:

```
sale_price     = average_cost * (1 + target / 100)
min_sale_price = average_cost * (1 + min / 100)
max_sale_price = average_cost * (1 + max / 100)
```

Si un margen está en 0 (no configurado), su precio correspondiente iguala al `sale_price`
— el rango colapsa a un punto y el comportamiento es el de hoy.
Se mantiene la guarda actual: sin `average_cost > 0` no se toca el precio manual.

### `purchasing.services.receive_lines()` — se simplifica

- Se **elimina** el cálculo de precio de `services.py:143`.
- El bloque que actualiza el promedio a mano se reemplaza por `apply_weighted_average()`.
- Después de actualizar el promedio, llama a `apply_margin(product)`.
- Al crear el `InventoryMovement` le pasa `unit_cost=line.landed_unit_cost` (4 decimales,
  sin cuantizar a centavos), `average_cost_after` y `purchase_order_line=line`.

Queda una sola fuente de verdad para el precio.

### `inventory.services.apply_adjustment()` — se extiende

- `adjustment_in` pasa a exigir `unit_cost > 0`; si falta, `ValidationError`.
- Llama a `apply_weighted_average()` y después a `apply_margin()`, dentro de la transacción
  que ya existe.
- `adjustment_out` no altera el promedio (sale al promedio vigente). Su `unit_cost` se
  registra como el `average_cost` del momento, para que el movimiento valorice la salida.
- Ambos escriben `average_cost_after`.

## Historial de costos

No hace falta tabla nueva: `InventoryMovement` **es** el historial. Con `average_cost_after`
y `purchase_order_line` queda completo.

### Endpoint

`GET /api/inventory/products/{id}/cost-history/`

Devuelve las entradas del producto (`purchase_in`, `adjustment_in`, `return_in`), más
recientes primero, con `select_related` sobre `purchase_order_line__purchase_order__supplier`
para no incurrir en N+1. Por cada fila:

| Campo | Origen |
|---|---|
| `created_at` | movimiento |
| `movement_type` | movimiento |
| `quantity` | movimiento |
| `unit_cost` | movimiento (landed, 4 decimales) |
| `average_cost_after` | movimiento |
| `purchase_order_number` | `purchase_order_line.purchase_order.order_number` |
| `supplier_name` | `purchase_order_line.purchase_order.supplier.name` |
| `supplier_unit_cost` | `purchase_order_line.unit_purchase_cost` |
| `allocated_extra_per_unit` | `purchase_order_line.allocated_extra_cost / quantity_ordered` |

Los cuatro campos que salen de `purchase_order_line` van en `null` cuando el movimiento no
viene de una compra (un ajuste, por ejemplo).

## Aviso de venta fuera de rango

Las líneas donde se teclea precio son `billing.QuoteLine`, `billing.InvoiceLine` y
`service_orders.ServiceOrderPart`. En los tres serializers se agregan dos campos de sólo lectura:

- `price_floor` — el `min_sale_price` vigente del producto
- `below_min_price` — `unit_price < min_sale_price` (y `min_sale_price > 0`)

Sin columnas nuevas y sin migración en esos tres modelos. La línea se guarda siempre;
el frontend la pinta en rojo con el motivo.

**Contrapartida asumida:** el juicio se hace contra el rango actual, así que si después se
suben los márgenes, ventas viejas pasan a aparecer como bajo el piso. Es deseable para saber
qué está por debajo del costo hoy; si más adelante se necesita auditoría congelada al momento
de la venta, requerirá dos columnas en cada uno de los tres modelos.

### Reporte

`GET /api/reports/below-floor-sales/` con filtros `from` / `to`. Une líneas de factura y de
orden de servicio contra el producto donde `unit_price < product.min_sale_price` y
`min_sale_price > 0`. Devuelve documento, fecha, producto, precio vendido, piso vigente,
diferencia absoluta y porcentual, y `created_by` (vive en la cabecera del documento, no en
la línea).

Las **cotizaciones quedan fuera del reporte**: son propuestas, no ventas, y contaminarían la
cifra con negociaciones que nunca se cerraron. El aviso en pantalla sí aparece al cotizar,
para que el vendedor lo vea antes de enviar la cotización.

## Frontend

- **`ProductFormModal.tsx`** — los tres márgenes, con el rango calculándose en vivo debajo
  mientras se escribe. Validación `min <= objetivo <= max` en cliente además de en servidor.
- **`LookupManager.tsx`** (categorías) — el mismo trío por categoría. Es donde realmente se va
  a configurar: hoy hay 10 categorías con margen y 0 productos con margen propio.
- **`ProductDetailPage.tsx`** — piso / sugerido / techo junto al costo promedio, y pestaña
  nueva **Historial de costos** consumiendo `/cost-history/`.
- **`AdjustStockModal.tsx`** — costo unitario obligatorio en ajuste positivo, con ayuda en
  línea explicando que entra al promedio.
- **Líneas de venta** (cotización, factura, piezas de orden) — línea en rojo con tooltip
  cuando `below_min_price`.
- **`ReportsPage.tsx`** — pestaña "Ventas bajo el piso".
- Regenerar `src/lib/api/schema.d.ts` con `npm run gen:api`.

## Migración y limpieza de datos

No hay backfill de precios: los 57 productos `SKU-*` con precio cargado eran de prueba y se
eliminan. Los 337 productos `T50-*` del catálogo real no se tocan.

Dos obstáculos, de naturaleza distinta:

- **57 `InventoryMovement`** con `on_delete=PROTECT` → **bloquean** el borrado. Hay que
  eliminarlos primero.
- **1 `InvoiceLine`** con `on_delete=SET_NULL` → **no bloquea**, pero es peor: al borrar el
  producto la línea sobrevive con `product = NULL` y la factura queda con una línea huérfana
  sin que nadie se entere. El comando debe detectar este caso y reportarlo, no dejarlo pasar
  en silencio.

(`ServiceOrderPart.product` también es `PROTECT`, pero hoy ninguna pieza de orden apunta a
productos `SKU-*`.)

Se entrega como comando de management:

`python manage.py purge_demo_products [--dry-run] [--confirm]`

`--dry-run` es el **comportamiento por defecto**: lista los productos y movimientos a borrar, y
además **las líneas de factura que quedarían huérfanas** (`product = NULL`), con el número de
factura de cada una, para decidir antes de ejecutar. Sólo borra con `--confirm` explícito,
dentro de una transacción. Si hay líneas de factura afectadas, exige además `--allow-orphans`
para no destruir el rastro de una factura emitida por descuido.

La migración de esquema es aditiva salvo el ensanche de `unit_cost` a 4 decimales, que no
pierde datos. Todos los campos nuevos tienen `default=0`, así que la migración no requiere
`RunPython`.

## Pruebas

TDD. Casos que deben existir:

**Costeo**
- Dos compras del mismo producto con fletes distintos → `average_cost` es el ponderado exacto
  (el caso de la simulación: 25.00 → 27.50).
- `sale_price` se deriva de `average_cost`, no del landed de la última compra (35.75, no 39.00).
- Stock en cero y nueva compra → el promedio se reinicia al costo de esa compra.
- Recepción parcial → el promedio sólo incorpora lo efectivamente recibido.

**Márgenes**
- Cascada producto → categoría → 0 para los tres márgenes, de forma independiente
  (un producto puede tener mínimo propio y heredar el máximo).
- `min > default` o `default > max` → `ValidationError`.
- Márgenes sin configurar → el rango colapsa al precio sugerido.

**Ajustes**
- `adjustment_in` sin `unit_cost` → `ValidationError`.
- `adjustment_in` con costo → mueve el promedio igual que una compra.
- `adjustment_out` → no altera el promedio.

**Historial**
- Cada movimiento de entrada guarda `average_cost_after` con el promedio posterior.
- `/cost-history/` devuelve el desglose proveedor/flete para compras y `null` para ajustes.
- Una orden con el mismo producto en dos líneas distintas → cada movimiento apunta a su
  línea correcta.
- El endpoint no incurre en N+1 (test de conteo de queries).

**Aviso fuera de rango**
- Línea bajo el piso → `below_min_price` en `true` y la línea **se guarda igual**.
- Producto sin rango configurado → `below_min_price` siempre `false`.
- El reporte lista sólo las líneas bajo el piso en el rango de fechas.

**Limpieza**
- `purge_demo_products --dry-run` no borra nada y lista productos, movimientos y líneas de
  factura que quedarían huérfanas.
- `--confirm` sin `--allow-orphans`, existiendo líneas de factura afectadas → aborta sin borrar.
- `--confirm --allow-orphans` → borra todo dentro de una transacción.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los precios de los productos `T50-*` cambian al recalcular | Esos 337 productos tienen `average_cost = 0`; `apply_margin` no toca precios sin costo base. No se ven afectados. |
| Hacer obligatorio el costo en ajuste positivo rompe flujos existentes | No hay flujo de producción que dependa de ello (la base sólo tiene ajustes de seed). El modal se actualiza en la misma entrega. |
| Ensanchar `unit_cost` a 4 decimales rompe consumidores | El único consumidor es la UI de movimientos, que formatea con `formatCurrency`. Se revisa en la misma entrega. |
| El comando de limpieza borra de más | `--dry-run` por defecto, `--confirm` explícito, todo en una transacción. |

## Dependencia con el otro sub-proyecto

La separación de equipos propios (trabajos de campo) vs. drones de clientes (mantenimiento)
es un sub-proyecto independiente que **va después de este**. No comparten código:
toca `equipment`, `field_jobs` y `service_orders`, mientras este toca `inventory` y `purchasing`.
