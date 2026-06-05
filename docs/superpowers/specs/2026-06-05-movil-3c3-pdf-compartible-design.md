# Móvil Fase 3c-3 — PDF compartible de facturas y cotizaciones

Tercer slice de la Fase 3c. Toca **backend** (endpoint PDF de cotización, hoy stub 501) y **móvil**
(descargar + compartir el PDF con `expo-sharing`). Gate: backend `pytest apps/billing` + móvil
`npm run typecheck` + `npx expo export`.

## Contexto

La factura ya genera PDF (`GET /api/invoices/{id}/pdf/`, `apps/billing/pdf.py`, ReportLab). En el
móvil hoy solo se comparte texto por WhatsApp (wa.me); falta adjuntar el archivo. La cotización ni
siquiera tiene PDF (stub 501). Este slice cierra ambos: PDF real de cotización en el backend y, en el
móvil, descargar el PDF (factura/cotización) y abrir la hoja de compartir del sistema.

## Backend

### `apps/billing/pdf.py` — PDF de cotización
Añadir, **reutilizando** los helpers existentes (`_styles`, `_money`, `_logo_flowable`, `_rule`,
`_company_contact`, `_items`):

- `build_quote_pdf_bytes(quote) -> bytes`
- `render_quote_pdf(quote, *, download=False) -> HttpResponse` (igual que `render_invoice_pdf`:
  `inline` por defecto, `attachment` si `download`; filename = `{quote.quote_number}.pdf`).

Funciones específicas de cotización (la cotización no tiene pagos ni saldo):
- `_quote_header(quote, company, st)`: como `_header` pero título **"COTIZACIÓN"**, subtítulo "Cotización"
  y `quote.quote_number`.
- `_quote_summary(quote, st)`: fila de 4 columnas **TOTAL / VENCE / COTIZACIÓN # / EMISIÓN** →
  `_money(quote.total)`, `expiration_date` (o "—"), `quote_number`, `issue_date`.
- `_quote_bill_to(quote, st)`: bloque "COTIZAR A" + datos del cliente; a la derecha, si
  `quote.service_order_id`, "ORDEN DE SERVICIO" + número.
- `_quote_bottom(quote, company, st)`: izquierda = términos (`quote.terms`) y notas (`quote.notes`)
  si existen; derecha = caja de totales (Subtotal, Descuento si >0, Impuesto si >0, **Total**), sin
  Pagado/Saldo.
- `build_quote_pdf_bytes`: `SimpleDocTemplate` A4 con story = header → company_contact → rule →
  summary → rule → bill_to → spacer → `_items(quote, st)` → spacer → bottom. (`_items` ya itera
  `obj.lines.all()` usando description/product/quantity/unit_price/total — válido para `QuoteLine`.)

`Quote` tiene: `quote_number, customer, service_order_id, issue_date, expiration_date, subtotal,
discount_percentage, tax_percentage, discount_amount, tax_amount, total, notes, terms`.

### `apps/billing/views.py` — `QuoteViewSet.pdf`
Reemplazar el stub (`return _pdf_stub()`) por:
```python
@action(detail=True, methods=["get"])
def pdf(self, request, pk=None):
    from .pdf import render_quote_pdf
    quote = self.get_object()
    download = request.query_params.get("download") in ("1", "true", "True")
    return render_quote_pdf(quote, download=download)
```
(Mismo patrón que `InvoiceViewSet.pdf`, líneas 211-216.)

### Tests — `apps/billing/tests/test_pdf.py`
Añadir un fixture `quote` (Customer + Quote ISSUED-equivalente `draft`/`sent` + 1 `QuoteLine` +
`recalculate_quote`) y 3 tests espejo de los de factura:
- `test_quote_pdf_returns_pdf`: 200, `Content-Type` PDF, `inline`, `quote_number` en disposition,
  contenido empieza con `%PDF`.
- `test_quote_pdf_download_disposition`: `?download=1` → `attachment`.
- `test_quote_pdf_requires_auth`: sin auth → 401.

## Móvil

### Dependencias
`npx expo install expo-file-system expo-sharing` (versiones para SDK 56).

### `features/billing/pdf.ts` — helper de compartir
```
shareDocumentPdf({ path, filename }): Promise<void>
```
- `url = ${API_BASE_URL}${path}?download=1` (p.ej. `path = "/api/invoices/12/pdf/"`).
- Token con `getAccess()` (de `lib/auth/tokens`).
- `FileSystem.downloadAsync(url, FileSystem.cacheDirectory + filename, { headers: { Authorization: Bearer } })`.
  Usar el API legacy si SDK 56 movió `downloadAsync`/`cacheDirectory` (importar de
  `expo-file-system/legacy` si el import por defecto no expone `downloadAsync`).
- Verificar `res.status === 200`; si no, `Alert` de error.
- `await Sharing.isAvailableAsync()`; si está, `Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })`. Si no, `Alert` informativo.
- Capturar errores con `Alert.alert("PDF", mensaje)`.

### `InvoiceDetailScreen`
Añadir botón **"Compartir PDF"** (icono `document-text`, variant subtle) junto al de WhatsApp (que se
**mantiene**), que llama `shareDocumentPdf({ path: \`/api/invoices/${inv.id}/pdf/\`, filename: \`${inv.invoice_number}.pdf\` })`.

### `QuoteDetailScreen`
Añadir botón **"Compartir PDF"** en la Card de acciones (siempre visible), que llama
`shareDocumentPdf({ path: \`/api/quotes/${q.id}/pdf/\`, filename: \`${q.quote_number}.pdf\` })`.

## Fuera de alcance
- Dark mode (slice 3c-4).
- WhatsApp de texto para cotización (se comparte el PDF directamente).

## Verificación
- Backend: `docker compose exec backend pytest apps/billing -q` (o el runner del proyecto) en verde.
- Móvil: `npm run typecheck` (exit 0) + `npx expo export --platform android`.
- Prueba del usuario (`r`): en una factura y en una cotización, "Compartir PDF" abre la hoja del sistema
  con el archivo adjunto.
