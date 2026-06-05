# Móvil 3c-3 — PDF compartible de facturas y cotizaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar el PDF de cotización en el backend (hoy stub 501) y, en el móvil, descargar y compartir el PDF (factura/cotización) por la hoja del sistema.

**Architecture:** Backend reutiliza los helpers de `apps/billing/pdf.py` para añadir el PDF de cotización y se cablea en `QuoteViewSet.pdf`. Móvil añade `expo-file-system` + `expo-sharing`, un helper `shareDocumentPdf` (descarga autenticada + hoja de compartir) y un botón en los dos detalles.

**Tech Stack:** Backend Django+DRF+ReportLab (tests con pytest en el contenedor `backend`). Móvil Expo SDK 56 + RN. Gate backend = `docker compose exec -T backend pytest apps/billing -q`; gate móvil = `npm run typecheck` + `npx expo export`. Commits en español, trailer `Co-Authored-By: Claude Opus 4.8`.

**Spec:** `docs/superpowers/specs/2026-06-05-movil-3c3-pdf-compartible-design.md`

Comandos backend desde la raíz del repo; comandos móviles desde `mobile/`.

---

### Task 1: Backend — PDF de cotización (TDD)

**Files:**
- Modify: `backend/apps/billing/tests/test_pdf.py`
- Modify: `backend/apps/billing/pdf.py`
- Modify: `backend/apps/billing/views.py`

- [ ] **Step 1: Escribir los tests (fallarán con 501)**

En `test_pdf.py`, cambiar el import de modelos a:
```python
from apps.billing.models import Invoice, InvoiceLine, Quote, QuoteLine
```
y añadir al final del archivo:

```python
@pytest.fixture
def quote(db):
    customer = Customer.objects.create(name="Cliente COT", phone="61234567")
    q = Quote.objects.create(customer=customer, status=Quote.Status.SENT)
    QuoteLine.objects.create(
        quote=q, description="Servicio", quantity=1, unit_price=Decimal("120")
    )
    from apps.billing.services import recalculate_quote

    recalculate_quote(q)
    return q


@pytest.mark.django_db
def test_quote_pdf_returns_pdf(quote):
    client = _client("sales")
    resp = client.get(f"/api/quotes/{quote.id}/pdf/")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    assert resp["Content-Disposition"].startswith("inline")
    assert quote.quote_number in resp["Content-Disposition"]
    content = b"".join(resp.streaming_content) if resp.streaming else resp.content
    assert content[:4] == b"%PDF"


@pytest.mark.django_db
def test_quote_pdf_download_disposition(quote):
    client = _client("sales")
    resp = client.get(f"/api/quotes/{quote.id}/pdf/?download=1")
    assert resp.status_code == 200
    assert resp["Content-Disposition"].startswith("attachment")


@pytest.mark.django_db
def test_quote_pdf_requires_auth(quote):
    resp = APIClient().get(f"/api/quotes/{quote.id}/pdf/")
    assert resp.status_code == 401
```

- [ ] **Step 2: Correr los tests nuevos (deben fallar)**

Run: `docker compose exec -T backend pytest apps/billing/tests/test_pdf.py -q -k quote`
Expected: FALLAN (`test_quote_pdf_returns_pdf` recibe 501; el de auth quizá pasa).

- [ ] **Step 3: Implementar el PDF de cotización en `pdf.py`**

Al final de `backend/apps/billing/pdf.py` añadir:

```python
def _quote_header(quote, company, st):
    right = [
        Paragraph("COTIZACIÓN", st["invoice_title"]),
        Paragraph("Cotización", st["doc_type"]),
        Spacer(1, 4),
        Paragraph(quote.quote_number, st["number"]),
    ]
    table = Table([[_logo_flowable(company), right]], colWidths=[9 * cm, 9 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "MIDDLE"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _quote_summary(quote, st):
    vence = f"{quote.expiration_date:%d/%m/%Y}" if quote.expiration_date else "—"
    emision = f"{quote.issue_date:%d/%m/%Y}"
    labels = ["TOTAL", "VENCE", "COTIZACIÓN #", "EMISIÓN"]
    values = [_money(quote.total), vence, quote.quote_number, emision]
    rows = [
        [Paragraph(l, st["label"]) for l in labels],
        [Paragraph(f"<b>{v}</b>", st["value"]) for v in values],
    ]
    table = Table(rows, colWidths=[CONTENT_W / 4] * 4)
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
    ]))
    return table


def _quote_bill_to(quote, st):
    c = quote.customer
    left = [Paragraph("COTIZAR A", st["label"]), Spacer(1, 2),
            Paragraph(f"<b>{c.name}</b>", st["value"])]
    if getattr(c, "identification_number", ""):
        left.append(Paragraph(c.identification_number, st["small"]))
    contact = " · ".join(x for x in (c.phone, c.email) if x)
    if contact:
        left.append(Paragraph(contact, st["small"]))

    right = []
    if quote.service_order_id:
        right = [
            Paragraph("ORDEN DE SERVICIO", st["label"]), Spacer(1, 2),
            Paragraph(quote.service_order.service_order_number, st["value"]),
        ]
    table = Table([[left, right]], colWidths=[10.5 * cm, 7.5 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _quote_bottom(quote, company, st):
    left = []
    if quote.terms:
        left.append(Paragraph("TÉRMINOS", st["label"]))
        left.append(Spacer(1, 2))
        left.append(Paragraph(quote.terms.replace("\n", "<br/>"), st["small"]))
    if quote.notes:
        left.append(Spacer(1, 8))
        left.append(Paragraph("NOTAS", st["label"]))
        left.append(Spacer(1, 2))
        left.append(Paragraph(quote.notes.replace("\n", "<br/>"), st["small"]))

    totals = [["Subtotal", _money(quote.subtotal)]]
    if quote.discount_amount:
        totals.append([
            f"Descuento ({quote.discount_percentage:.2f}%)",
            "−" + _money(quote.discount_amount),
        ])
    if quote.tax_amount:
        totals.append([
            f"Impuesto ({quote.tax_percentage:.2f}%)",
            _money(quote.tax_amount),
        ])
    totals.append(["Total", _money(quote.total)])
    total_row = len(totals) - 1

    box = Table(totals, colWidths=[4.2 * cm, 3.3 * cm])
    box.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, total_row), (-1, total_row), 1.2, BRAND),
        ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, total_row), (-1, total_row), INK),
        ("FONTSIZE", (0, total_row), (-1, total_row), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    outer = Table([[left, box]], colWidths=[10.5 * cm, 7.5 * cm])
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer


def build_quote_pdf_bytes(quote):
    company = CompanyProfile.load()
    st = _styles()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.4 * cm, bottomMargin=1.4 * cm,
        title=quote.quote_number,
    )
    story = [
        _quote_header(quote, company, st),
        Spacer(1, 10),
        _company_contact(company, st),
        _rule(space_before=12, space_after=12),
        _quote_summary(quote, st),
        _rule(space_before=12, space_after=12),
        _quote_bill_to(quote, st),
        Spacer(1, 14),
        _items(quote, st),
        Spacer(1, 14),
        _quote_bottom(quote, company, st),
    ]
    doc.build(story)
    return buffer.getvalue()


def render_quote_pdf(quote, *, download=False):
    """HttpResponse con el PDF de la cotización. download=True → adjunto."""
    pdf = build_quote_pdf_bytes(quote)
    disposition = "attachment" if download else "inline"
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'{disposition}; filename="{quote.quote_number}.pdf"'
    )
    return response
```

- [ ] **Step 4: Cablear `QuoteViewSet.pdf` en `views.py`**

Reemplazar el método `pdf` de `QuoteViewSet` (hoy `self.get_object(); return _pdf_stub()`) por:

```python
    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        from .pdf import render_quote_pdf

        quote = self.get_object()
        download = request.query_params.get("download") in ("1", "true", "yes")
        return render_quote_pdf(quote, download=download)
```

- [ ] **Step 5: Correr los tests (deben pasar)**

Run: `docker compose exec -T backend pytest apps/billing/tests/test_pdf.py -q`
Expected: todos PASAN.

- [ ] **Step 6: Suite de billing completa (no romper nada)**

Run: `docker compose exec -T backend pytest apps/billing -q`
Expected: PASA (≈ los tests previos + 3 nuevos).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/billing/pdf.py backend/apps/billing/views.py backend/apps/billing/tests/test_pdf.py
git commit -m "feat(billing): PDF real de cotizacion (cierra stub 501)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Móvil — instalar `expo-file-system` y `expo-sharing`

**Files:**
- Modify: `mobile/package.json`, `mobile/package-lock.json`

- [ ] **Step 1: Instalar (versiones para SDK 56)**

Run (desde `mobile/`): `npx expo install expo-file-system expo-sharing`
Expected: añade ambas deps con versiones compatibles; sin errores de peer-deps.

- [ ] **Step 2: Sanity typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(movil): expo-file-system y expo-sharing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Móvil — helper `shareDocumentPdf`

**Files:**
- Create: `mobile/src/features/billing/pdf.ts`

- [ ] **Step 1: Crear el helper**

```ts
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API_BASE_URL } from "../../lib/api/baseUrl";
import { getAccess } from "../../lib/auth/tokens";

/** Descarga (autenticada) el PDF del documento y abre la hoja de compartir del sistema. */
export async function shareDocumentPdf({
  path,
  filename,
}: {
  path: string; // p.ej. "/api/invoices/12/pdf/"
  filename: string; // p.ej. "FAC-000012.pdf"
}) {
  try {
    const token = await getAccess();
    const url = `${API_BASE_URL}${path}?download=1`;
    const target = `${FileSystem.cacheDirectory}${filename}`;
    const res = await FileSystem.downloadAsync(url, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status !== 200) {
      Alert.alert("PDF", "No se pudo descargar el documento.");
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("PDF", `Descargado en:\n${res.uri}`);
      return;
    }
    await Sharing.shareAsync(res.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: filename,
    });
  } catch (e) {
    Alert.alert("PDF", (e as Error).message ?? "No se pudo compartir el documento.");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (Si `expo-file-system/legacy` no resuelve tipos en esta versión, cambiar el import a `import * as FileSystem from "expo-file-system";` — `downloadAsync`/`cacheDirectory` siguen disponibles.)

- [ ] **Step 3: Commit**

```bash
git add src/features/billing/pdf.ts
git commit -m "feat(movil): helper shareDocumentPdf (descarga + hoja de compartir)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Móvil — botón "Compartir PDF" en los dos detalles

**Files:**
- Modify: `mobile/src/features/billing/InvoiceDetailScreen.tsx`
- Modify: `mobile/src/features/billing/QuoteDetailScreen.tsx`

- [ ] **Step 1: Factura**

En `InvoiceDetailScreen.tsx`:
- Importar el helper: `import { shareDocumentPdf } from "./pdf";`
- En la Card de acciones, tras el botón "WhatsApp", añadir:

```tsx
        <Button
          title="Compartir PDF"
          icon="document-text"
          variant="subtle"
          onPress={() =>
            void shareDocumentPdf({
              path: `/api/invoices/${inv.id}/pdf/`,
              filename: `${inv.invoice_number ?? "factura"}.pdf`,
            })
          }
        />
```

- [ ] **Step 2: Cotización**

En `QuoteDetailScreen.tsx`:
- Importar el helper: `import { shareDocumentPdf } from "./pdf";`
- La Card de acciones hoy solo se renderiza si `(canApprove || canReject || canConvert || canEdit)`.
  Como el PDF debe estar siempre disponible, **quitar esa condición** y renderizar la Card siempre.
  Reemplazar:

```tsx
      {(canApprove || canReject || canConvert || canEdit) && (
        <Card style={styles.actions}>
          {canApprove && <Button title="Aprobar" icon="checkmark" onPress={() => run("approve", "¿Aprobar la cotización?")} />}
          {canEdit && <Button title="Editar" icon="create" variant="subtle" onPress={() => setEditOpen(true)} />}
```

por:

```tsx
      <Card style={styles.actions}>
        {canApprove && <Button title="Aprobar" icon="checkmark" onPress={() => run("approve", "¿Aprobar la cotización?")} />}
        {canEdit && <Button title="Editar" icon="create" variant="subtle" onPress={() => setEditOpen(true)} />}
        <Button
          title="Compartir PDF"
          icon="document-text"
          variant="subtle"
          onPress={() =>
            void shareDocumentPdf({
              path: `/api/quotes/${q.id}/pdf/`,
              filename: `${q.quote_number ?? "cotizacion"}.pdf`,
            })
          }
        />
```

y cambiar el cierre de esa Card (la línea `        </Card>` que cerraba el bloque condicional)
quitando el `)}` del condicional: debe quedar solo `      </Card>`. (Los botones `canConvert` y
`canReject` internos no cambian.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/billing/InvoiceDetailScreen.tsx src/features/billing/QuoteDetailScreen.tsx
git commit -m "feat(movil): boton Compartir PDF en factura y cotizacion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verificación final

**Files:** ninguno.

- [ ] **Step 1: Typecheck móvil**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Export del bundle**

Run: `npx expo export --platform android`
Expected: "Exported: dist" sin error.

- [ ] **Step 3:** Sin commit. Listo para prueba del usuario (`r`): en una factura y una cotización,
  "Compartir PDF" descarga y abre la hoja del sistema con el archivo.

---

## Notas de implementación
- El PDF de cotización reutiliza `_styles/_money/_logo_flowable/_company_contact/_rule/_items` y los
  colores `BRAND/INK/GREY/CONTENT_W` de `pdf.py` (todos a nivel de módulo).
- `_items` itera `obj.lines.all()` con description/product/quantity/unit_price/total → `QuoteLine` los tiene.
- La descarga usa el mismo patrón autenticado que `orders/photos.ts` (Bearer + `API_BASE_URL`), porque
  el endpoint exige JWT (no sirve abrir la URL en el navegador del teléfono).
- En emulador la `API_BASE_URL` apunta a `127.0.0.1:8000` vía `adb reverse`; el PDF se descarga igual.
