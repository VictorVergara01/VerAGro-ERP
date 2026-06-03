# Plan — Módulo de Cotizaciones y Facturación (`apps.billing`)

**Spec:** `docs/superpowers/specs/2026-06-03-modulo-facturacion-design.md`
**Rama:** `master`.

## Tareas (TDD)

1. **Inventario**: añadir `MovementType.SALE_OUT`; `consume_stock(movement_type=...)`;
   `makemigrations inventory` (0003). Test del movimiento sale_out.
2. **Modelos billing**: Quote, QuoteLine, Invoice, InvoiceLine, Payment (spec §3);
   numbers auto `COT-`/`FAC-`. `makemigrations billing` (0001). Tests de modelos.
3. **Servicios** (`services.py`): recalculate_quote, recalculate_invoice (margin/balance/estado
   de pago), create_quote_from_service_order, create_invoice_from_service_order,
   convert_quote_to_invoice, issue_invoice (descuento product_sale), record_payment. Tests.
4. **Serializers**: Quote(+lines), QuoteLine, Invoice(+lines), InvoiceLine, Payment, InvoiceSummary.
5. **Views + URLs**: QuoteViewSet (+approve/reject/convert-to-invoice/pdf) + QuoteLineViewSet;
   InvoiceViewSet (+issue/cancel/payments/pdf) + InvoiceLineViewSet. Permisos
   RoleWriteOrReadOnly("admin","sales"). Router en config/urls.py. Tests API.
6. **Integración service_orders**: conectar generate-quote/generate-invoice (import local de
   billing); endurecer `deliver` (exige invoiced salvo admin). Ajustar tests de service_orders.
7. **Customers**: `/customers/{id}/invoices/` → facturas reales paginadas. Ajustar test placeholder.
8. **Admin**: registrar Quote/Invoice (inline líneas), Payment.
9. **Verificación**: check, makemigrations --check, schema --fail-on-warn, suite verde, en vivo.
10. **Commit + memoria**: progreso (Facturación hecho; próximo Reportes) + followups.

## Notas
- Dependencia unidireccional billing→service_orders/inventory (imports locales donde aplique).
- `deliver` cambia de comportamiento: actualizar `test_status_transitions`/deliver en service_orders.
- product_sale: consume_stock con movement_type=sale_out, reference invoice.
