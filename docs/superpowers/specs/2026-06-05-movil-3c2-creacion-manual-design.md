# Móvil Fase 3c-2 — Creación/edición manual de Cotización, Factura y OC con líneas

Segundo slice de la Fase 3c (paridad móvil ↔ web). Puramente frontend móvil:
el backend ya acepta `lines`/`additional_costs` anidadas en POST y PATCH (sub-proyectos web 27/28 y compras).
Gate: `npm run typecheck` + `expo export`.

## Contexto

Hoy en móvil las cotizaciones y facturas solo nacen **auto-desde-orden** (o convirtiendo una
cotización), y las órdenes de compra no se pueden crear desde la app. La web sí permite crearlas y
editarlas manualmente con líneas dinámicas. Este slice cierra ese gap.

## Contratos del backend (confirmados desde el frontend web)

### Cotización — `POST /api/quotes/` y `PATCH /api/quotes/{id}/`
```
{
  customer: number,
  issue_date?: string,          // "" → omitir
  expiration_date?: string|null,
  discount_percentage: string,  // "0"
  tax_percentage: string,
  notes: string,
  terms: string,
  lines: [{ line_type: string, description: string, quantity: string, unit_price: string }]
}
```
Sin producto ni costo por línea. PATCH reemplaza las líneas (backend borra+recrea). Editable solo en
`draft`/`sent` (guard del viewset).

### Factura — `POST /api/invoices/` y `PATCH /api/invoices/{id}/`
```
{
  customer: number,
  invoice_type: "service_invoice"|"final_invoice"|"product_sale",
  issue_date?: string,
  due_date?: string|null,
  discount_percentage: string,
  tax_percentage: string,
  notes: string,
  lines: [{ line_type, product: number|null, description, quantity, unit_price, unit_cost }]
}
```
Elegir producto en una línea autollena `description`/`unit_price` (sale_price)/`unit_cost`
(average_cost) y fija `line_type="product"`. Editable solo en `draft`.

### Orden de compra — `POST /api/purchase-orders/`
```
{
  supplier: number,
  order_date?: string,
  expected_date?: string|null,
  currency: string,             // "USD"
  shipping_cost: string,
  notes: string,
  lines: [{ product: number, quantity_ordered: string, unit_purchase_cost: string, margin_percentage: string }],
  additional_costs: [{ name: string, amount: string }]
}
```
Cada línea requiere producto. Solo creación (la edición de líneas de OC queda fuera de alcance).

### Opciones (replicar en móvil)
- `LINE_TYPE_OPTIONS`: product, service, labor, diagnostic, other.
- `INVOICE_TYPE_OPTIONS`: service_invoice, final_invoice, product_sale.

## Diseño

### Helpers reutilizables — `components/ui/form.tsx`
- `LineCard`: contenedor de una línea (Card) con cabecera "Línea N" + botón eliminar (icono `trash`,
  rojo). Recibe `index`, `onRemove`, `children`.
- `AddRowButton`: botón con borde discontinuo "+ Agregar" (label configurable).

Cada modal mantiene su array de líneas con `useState<Line[]>` y handlers `addLine`/`updateLine(i, patch)`/
`removeLine(i)`. Los campos numéricos usan `LabeledInput` con `keyboardType="decimal-pad"`. Los selects
usan el `Picker` existente.

### `billing/api.ts` — hooks nuevos
- `useCreateQuote()` → `POST /api/quotes/`, devuelve `Quote`, invalida `["quotes"]`.
- `useUpdateQuote(id)` → `PATCH /api/quotes/{id}/`, invalida `["quote", id]` + `["quotes"]`.
- `useCreateInvoice()` → `POST /api/invoices/`, devuelve `Invoice`, invalida `["invoices"]`.
- `useUpdateInvoice(id)` → `PATCH /api/invoices/{id}/`, invalida `["invoice", id]` + `["invoices"]`.

Tipos de entrada con interfaces locales (`QuoteInput`/`InvoiceInput`); el body se castea
`as unknown as Quote`/`Invoice` (patrón ya usado en el módulo).

### `purchasing/api.ts` — hook nuevo
- `useCreatePurchaseOrder()` → `POST /api/purchase-orders/`, devuelve `PurchaseOrder`, invalida
  `["purchase-orders"]`.

### Modales
- `billing/QuoteFormModal.tsx` (crear + editar): prop opcional `quote?: Quote|null`. Si viene, prellenar
  y PATCH (título "Editar cotización", submit "Guardar"); si no, POST (título "Nueva cotización",
  "Crear"). Cliente (Picker desde `useCustomers("")`), fechas (LabeledInput tipo texto `YYYY-MM-DD`),
  descuento/impuesto %, notas, términos, líneas (Picker tipo + descripción + cantidad + precio).
  Validar: cliente requerido y ≥1 línea.
- `billing/InvoiceFormModal.tsx` (crear + editar): prop opcional `invoice?: Invoice|null`. Cliente, tipo
  de factura (Picker, default `product_sale`), fechas, desc/imp %, notas, líneas (Picker tipo +
  Picker producto opcional desde `useProductSearch("")` que autollena descripción/precio/costo +
  descripción + cantidad + precio + costo). Validar cliente + ≥1 línea.
- `purchasing/PurchaseOrderFormModal.tsx` (crear): proveedor (Picker desde `useSuppliers("")`), fechas,
  moneda (default "USD"), envío, líneas (Picker producto + cantidad + costo unit + margen %) y costos
  adicionales (nombre + monto). Validar proveedor + ≥1 línea + cada línea con producto.

Tras crear, el modal cierra y navega al detalle correspondiente (`useNavigation<MoreNav>()`:
`QuoteDetail`/`InvoiceDetail`/`PurchaseOrderDetail`). Tras editar, solo cierra (el detalle se refresca
por invalidación).

### Cableado de pantallas
- `QuotesScreen`, `InvoicesScreen`, `PurchasingScreen`: añadir `FAB` que abre el modal de creación.
- `QuoteDetailScreen`: botón "Editar" cuando `status ∈ {draft, sent}` → abre `QuoteFormModal` con la
  cotización.
- `InvoiceDetailScreen`: botón "Editar" cuando `status === "draft"` → abre `InvoiceFormModal` con la
  factura.

## Fuera de alcance
- Edición de líneas de OC (solo creación). Follow-up.
- PDF compartible (slice 3c-3), dark mode (slice 3c-4). Sin cambios de backend.

## Verificación
- `cd mobile && npm run typecheck` (exit 0) tras cada tarea.
- `npx expo export --platform android` al final.
- Prueba del usuario en dispositivo (`r`): crear COT con líneas, FAC `product_sale` con producto,
  OC con líneas + costo adicional; editar una COT/FAC en borrador.
