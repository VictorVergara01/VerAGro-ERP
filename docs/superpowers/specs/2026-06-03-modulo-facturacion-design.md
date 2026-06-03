# Spec — Módulo de Cotizaciones y Facturación Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 8 — Cotizaciones y Facturación (`apps.billing`)

## 1. Contexto y alcance

Octavo sub-proyecto, sobre `master`. Implementa cotizaciones (doc §5.9), facturas y pagos
(§5.10), API §7.9/§7.10. Cierra los stubs 501 `generate-quote`/`generate-invoice` de
`service_orders`, conecta `/customers/{id}/invoices/` y aplica la regla "no entregar sin
facturar".

### Dentro del alcance
- Modelos `Quote`, `QuoteLine`, `Invoice`, `InvoiceLine`, `Payment` (doc §5.9/§5.10).
- Servicios: cálculo de totales (quote/invoice), creación desde orden de servicio, conversión
  cotización→factura, emisión de factura, registro de pago.
- **Inventario**: factura `product_sale` descuenta stock al emitir (`sale_out`); facturas de
  servicio NO (ya se consumió en `finish`). Nuevo movimiento `sale_out` (decisión 1a).
- **Regla de entrega** (decisión 2a): `deliver` exige orden `invoiced`, salvo `admin` (override).
- API: `/api/quotes/` (+approve/reject/convert-to-invoice/pdf), `/api/invoices/`
  (+issue/cancel/payments/pdf), gestión de líneas; conectar `generate-quote`/`generate-invoice`.
- Conectar `/api/customers/{id}/invoices/` (placeholder → facturas reales paginadas).
- PDF endpoints como stub 501 (decisión 3a).
- Permisos `RoleWriteOrReadOnly("admin","sales")` en billing.
- Tests TDD + verificación.

### Fuera del alcance (diferido)
- Render real de PDF → stub 501.
- Reportes (§5.11) → sub-proyecto 9 (usará margin_amount, profit, etc.).
- Notas de crédito / reembolsos; impuestos calculados por tasa (el tax_amount es manual).
- Multimoneda.

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Descuento de inventario | `product_sale` descuenta al emitir (`sale_out`); servicio no re-descuenta | La orden ya consumió en `finish`; evita doble descuento (1a). |
| Entrega sin factura | `deliver` exige `invoiced`, salvo admin | Doc §5.10 "salvo permiso especial" = admin (2a). |
| PDF | Stub 501 | Render llega con frontend/reportes (3a). |
| Numeración | `COT-NNNNNN` / `FAC-NNNNNN` autogenerado desde pk si vacío; unique | Igual que compras/servicios. |
| `service_order`/`quote`/`product` en docs | FK SET_NULL nullable | El doc/línea sobrevive a la baja del origen; líneas sin producto (labor/servicio). |
| on_delete líneas/pagos | CASCADE (hijos del documento). customer PROTECT. | El documento agrupa sus líneas/pagos. |
| `order.status=invoiced` | Al **emitir** la factura de servicio (no al crear el borrador) | "Invoiced" refleja factura emitida; habilita `deliver`. |
| Estado de pago | `recalculate_invoice` setea paid/partially_paid solo si la factura está emitida | balance_due = total − paid_amount (doc §5.10). |

## 3. Modelos (`backend/apps/billing/models.py`, TimeStampedModel)

### Quote
- `quote_number` CharField(30) unique blank (auto `COT-{pk:06d}`)
- `customer` FK→customers.Customer PROTECT related_name="quotes"
- `service_order` FK→service_orders.ServiceOrder SET_NULL null/blank related_name="quotes"
- `status` choices=[draft, sent, approved, rejected, expired, converted_to_invoice] default draft
- `issue_date` DateField default hoy; `expiration_date` DateField null/blank
- `subtotal`/`discount_amount`/`tax_amount`/`total` Decimal(14,2) default 0 (subtotal/total derivados)
- `notes`, `terms` TextField blank; `created_by` FK→users.User SET_NULL
- Meta.ordering=("-created_at",); __str__→quote_number

### QuoteLine
- `quote` FK→Quote CASCADE related_name="lines"
- `product` FK→inventory.Product SET_NULL null/blank related_name="+"
- `description` CharField(255) blank
- `quantity` Decimal(12,2) default 1; `unit_price` Decimal(12,2) default 0
- `discount_amount`/`tax_amount` Decimal(14,2) default 0
- `total` Decimal(14,2) default 0 (derivado = quantity*unit_price − discount + tax)
- `line_type` choices=[product, service, labor, diagnostic, other] default product
- Meta.ordering=("id",)

### Invoice
- `invoice_number` CharField(30) unique blank (auto `FAC-{pk:06d}`)
- `invoice_type` choices=[service_invoice, final_invoice, product_sale] default service_invoice
- `customer` FK→customers.Customer PROTECT related_name="invoices"
- `service_order` FK→service_orders.ServiceOrder SET_NULL null/blank related_name="invoices"
- `quote` FK→Quote SET_NULL null/blank related_name="invoices"
- `status` choices=[draft, issued, partially_paid, paid, cancelled] default draft
- `issue_date` DateField default hoy; `due_date` DateField null/blank
- `subtotal`/`discount_amount`/`tax_amount`/`total`/`paid_amount`/`balance_due` Decimal(14,2)
  default 0 (subtotal/total/paid_amount/balance_due derivados)
- `notes` TextField blank; `created_by` FK→users.User SET_NULL
- Meta.ordering=("-created_at",); __str__→invoice_number

### InvoiceLine
- `invoice` FK→Invoice CASCADE related_name="lines"
- `product` FK→inventory.Product SET_NULL null/blank related_name="+"
- `description` CharField(255) blank
- `quantity` Decimal(12,2) default 1; `unit_price`/`unit_cost` Decimal(12,2) default 0
- `margin_amount` Decimal(14,2) default 0 (derivado = (unit_price − unit_cost)*quantity)
- `discount_amount`/`tax_amount` Decimal(14,2) default 0
- `total` Decimal(14,2) default 0 (derivado)
- `line_type` choices (igual que QuoteLine) default product
- Meta.ordering=("id",)

### Payment
- `invoice` FK→Invoice CASCADE related_name="payments"
- `payment_date` DateField default hoy; `amount` Decimal(14,2)
- `method` choices=[cash, bank_transfer, yappy, ach, card, other] default cash
- `reference_number` CharField(100) blank; `notes` TextField blank
- `created_by` FK→users.User SET_NULL
- Meta.ordering=("-payment_date","id")

### Inventario (cambio)
- `InventoryMovement.MovementType`: añadir `SALE_OUT = "sale_out"` ("Salida por venta").
- `inventory.services.consume_stock`: parámetro `movement_type=SERVICE_OUT` (default) para
  reutilizarlo en ventas (`sale_out`). Migración `inventory.0003` (solo choices).

### Migraciones
- `inventory.0003` (alter choices de movement_type).
- `billing.0001` crea los 5 modelos. Depende de customers, service_orders, inventory, users.

## 4. Servicios (`backend/apps/billing/services.py`)
Decimal, quantize 0.01.
- `recalculate_quote(quote)`: por línea `total = quantity*unit_price − discount + tax`;
  `subtotal = Σ (quantity*unit_price)`; `total = subtotal − discount_amount + tax_amount`.
- `recalculate_invoice(invoice)`: por línea `margin_amount`, `total`; `subtotal`/`total` del doc;
  `paid_amount = Σ payments.amount`; `balance_due = total − paid_amount`. Si la factura está
  `issued/partially_paid/paid`: `paid>=total→paid`; `0<paid<total→partially_paid`; `paid==0→issued`.
- `create_quote_from_service_order(*, order, user)`: crea Quote (customer, service_order); líneas:
  labor_cost (line_type labor, si >0), diagnostic_fee (diagnostic, si >0), cada ServiceOrderPart
  (product, description=producto, quantity, unit_price); copia discount/tax de la orden; recalc.
- `create_invoice_from_service_order(*, order, user)`: requiere `order.status == finished`;
  invoice_type=service_invoice; mismas líneas (con unit_cost de la pieza para margin); recalc.
  NO descuenta inventario (ya en finish).
- `convert_quote_to_invoice(*, quote, user)`: requiere `quote.status == approved`; crea Invoice
  (quote, customer, service_order heredados; invoice_type final_invoice) con líneas copiadas;
  `quote.status = converted_to_invoice`; recalc.
- `issue_invoice(*, invoice, user)`: requiere `draft`; → `issued`. Si `invoice_type ==
  product_sale`: por cada línea con product → `consume_stock(movement_type=sale_out,
  reference_type="invoice", reference_id=invoice.id)`. Si tiene `service_order` en estado
  `finished` → `order.status = invoiced`. recalc.
- `record_payment(*, invoice, amount, method, payment_date=None, reference_number="", notes="",
  user=None)`: requiere factura `issued/partially_paid` y `amount>0`; crea Payment; recalc
  (actualiza paid_amount/balance_due/status).

## 5. Permisos
`RoleWriteOrReadOnly("admin","sales")` en `Quote*`, `Invoice*`, `Payment` viewsets y sus
acciones. Lectura para autenticados. Las acciones `generate-quote`/`generate-invoice` viven en
`ServiceOrderViewSet` y conservan su permiso (`admin`,`technician`) — quien trabaja la orden
genera el documento; sales/admin gestionan cobro en `/api/invoices/`.

## 6. API (SimpleRouter, en config/urls.py bajo /api/)

### Quotes → `/api/quotes/`
- CRUD con líneas anidadas en creación (writable); derivados read-only. `created_by` del request.
- Filtros `?customer=`, `?service_order=`, `?status=` (id no numérico → 400). Search `quote_number`.
- Edición solo en `draft`/`sent`. Acciones POST: `approve` (sent/draft→approved),
  `reject` (→rejected), `convert-to-invoice` (approved→crea factura, devuelve la factura),
  `pdf` (GET, stub 501).
- `/api/quote-lines/` CRUD (filtro `?quote=`), recalcula la cotización; solo si draft/sent.

### Invoices → `/api/invoices/`
- CRUD con líneas anidadas en creación; derivados read-only. Filtros `?customer=`,
  `?service_order=`, `?status=`, `?invoice_type=`. Search `invoice_number`.
- Edición solo en `draft`. Acciones POST: `issue` (draft→issued, descuento si product_sale),
  `cancel` (no si paid; → cancelled), `payments` (POST registra pago; GET lista pagos),
  `pdf` (GET, stub 501).
- `/api/invoice-lines/` CRUD (filtro `?invoice=`), recalcula; solo si draft.

### Integración service_orders (acciones existentes, import local de billing)
- `generate-quote`: crea cotización desde la orden (devuelve 201 con la cotización).
- `generate-invoice`: crea factura draft desde la orden (201).
- `deliver`: ahora exige `order.status == invoiced` salvo `request.user.role == "admin"`.

### Customers
- `/api/customers/{id}/invoices/`: facturas reales del cliente (paginadas) — cierra placeholder.

## 7. Serializers
- `QuoteLineSerializer`/`InvoiceLineSerializer`: inputs + derivados read-only (total, margin),
  `product_sku` read-only; `quote`/`invoice` required=False (anidado).
- `QuoteSerializer`/`InvoiceSerializer`: líneas anidadas (read; write en create), derivados y
  numbers/status read-only; `customer_name` read-only; create atómico + recalc.
- `PaymentSerializer`: campos del pago; `invoice` desde la URL/acción.
- `InvoiceSummarySerializer`: para `/customers/{id}/invoices/` (number, type, status, total,
  balance_due, issue_date).

## 8. Pruebas (TDD)
- **Modelos**: numbers autogenerados/unique; status defaults; CASCADE líneas/pagos.
- **Servicios**: recalculate_quote/invoice (totales, margin, balance_due); estado de pago
  (issued→partially_paid→paid); create_quote/invoice_from_service_order (líneas labor+diagnostic+
  piezas); convert_quote_to_invoice (requiere approved); issue_invoice product_sale descuenta
  (`sale_out`, stock baja) y service_invoice NO; issue setea order.invoiced; record_payment.
- **Inventario**: `consume_stock(movement_type=sale_out)` crea el movimiento correcto.
- **API**: CRUD quote/invoice con líneas; approve/reject/convert; issue/cancel/payments;
  generate-quote/generate-invoice desde la orden (ya no 501); deliver bloqueado sin factura salvo
  admin; pdf → 501; filtros no numéricos → 400; permisos (sales 201, technician 403 en billing,
  readonly/inventory 403; admin 201); `/customers/{id}/invoices/` paginado.

## 9. Verificación
- `makemigrations` (inventory.0003, billing.0001) creadas/committeadas; `migrate` limpio; `check`;
  `makemigrations --check` sin cambios; schema OpenAPI válido (`--fail-on-warn`).
- Suite completa en verde (187 previos + nuevos).
- En vivo: orden finished → generate-invoice → issue (order→invoiced) → payment (paid) → deliver;
  venta product_sale que descuenta stock; cotización approve→convert→invoice; docs.

## 10. Criterio de aceptación
- Cotización y factura con líneas y totales; numeración; estados.
- generate-quote/generate-invoice desde orden funcionan (stubs 501 eliminados).
- product_sale descuenta inventario al emitir; servicio no re-descuenta.
- Pagos: paid_amount/balance_due/status correctos.
- deliver exige factura salvo admin.
- `/customers/{id}/invoices/` real; OpenAPI documenta; suite en verde.

## 11. Siguientes sub-proyectos
Reportes (§5.11, usa margin/profit/low-stock/etc.) → Frontend web/móvil. Ver doc §13.
