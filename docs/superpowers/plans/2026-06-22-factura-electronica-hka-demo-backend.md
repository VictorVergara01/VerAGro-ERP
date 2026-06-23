# Factura Electrónica HKA (DEMO) — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend de una **factura electrónica simulada (demo)**: un app aislado `apps/fiscal/` con un proveedor enchufable que genera CUFE/CAFE falsos, sin llamar a HKA ni requerir credenciales, y los endpoints para emitir y descargar el CAFE desde una factura.

**Architecture:** App `apps/fiscal/` con modelo `FiscalDocument` (1:1 con `billing.Invoice`), un **proveedor enchufable** (`providers/`: `base` + `demo`, seleccionado por `settings.FISCAL_PROVIDER`), servicios `emit_fiscal_document`/`void_fiscal_document`, y un generador de CAFE (PDF con QR, ReportLab + `qrcode`). El `billing.InvoiceViewSet` gana acciones `emit-fiscal` y `cafe` que delegan en `apps/fiscal`; el `InvoiceSerializer` expone los datos fiscales.

**Tech Stack:** Django + DRF, pytest, ReportLab (ya instalado), `qrcode` (nueva dep, usa Pillow ya instalado), Docker (`docker compose exec -T backend ...`).

## Global Constraints

- Rama `V2.0`; **no** mergear a master sin pedido explícito.
- **Demo simulado:** NO se llama a HKA/DGI; NO se requieren credenciales. `settings.FISCAL_PROVIDER` default `"demo"`.
- El CAFE siempre lleva la marca visible **"DEMO — sin validez fiscal"**.
- Permiso para emitir FEL = el de facturación: `roles.BILLING_WRITE` (admins + sales). En este código NO existe rol `"admin"`; los admins son `roles.ADMINS = (super_admin, general_admin)`.
- `emit_fiscal_document` solo opera sobre facturas **emitidas** (NO `draft`, NO `cancelled`) y una sola vez.
- Tras agregar dependencia o migración: rebuild + migrate del backend antes de probar (ver memoria backend-autoreload-windows). Tests con `docker compose exec -T backend pytest`.
- Usuarios en tests: `User.objects.create_user(email=..., password=..., role="general_admin", full_name="A B")`.
- Commits en español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `backend/apps/fiscal/__init__.py`, `apps.py`, `models.py`, `migrations/__init__.py` — app + `FiscalDocument`.
- `backend/apps/fiscal/providers/__init__.py` (`get_provider`), `base.py` (`FiscalProvider`, `EmitResult`), `demo.py` (`DemoProvider`).
- `backend/apps/fiscal/services.py` — `emit_fiscal_document`, `void_fiscal_document`.
- `backend/apps/fiscal/cafe.py` — `render_cafe(invoice, download=False) -> HttpResponse`.
- `backend/apps/fiscal/tests/` — model, provider, services, api.
- `backend/config/settings/base.py` — `apps.fiscal` en LOCAL_APPS + `FISCAL_PROVIDER`.
- `backend/requirements.txt` — `qrcode`.
- `backend/apps/billing/views.py` — acciones `emit-fiscal`, `cafe`; `cancel` llama `void_fiscal_document`.
- `backend/apps/billing/serializers.py` — campo `fiscal` en `InvoiceSerializer`.

---

### Task 1: Scaffold del app + modelo + dependencia + settings

**Files:**
- Create: `backend/apps/fiscal/__init__.py`, `apps.py`, `models.py`, `migrations/__init__.py`
- Modify: `backend/config/settings/base.py`, `backend/requirements.txt`
- Test: `backend/apps/fiscal/tests/__init__.py`, `backend/apps/fiscal/tests/test_models.py`

**Interfaces:**
- Produces: `FiscalDocument` (1:1 `billing.Invoice`, `related_name="fiscal"`) con `cufe, protocol, fiscal_status, environment, provider, issued_at, cancelled_at`; `FiscalDocument.FiscalStatus` (pending/authorized/rejected/cancelled), `FiscalDocument.Environment` (demo/production). `settings.FISCAL_PROVIDER="demo"`.

- [ ] **Step 1: Crear el app y el modelo**

Crear `backend/apps/fiscal/__init__.py` (vacío) y `backend/apps/fiscal/apps.py`:
```python
from django.apps import AppConfig


class FiscalConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.fiscal"
```

Crear `backend/apps/fiscal/migrations/__init__.py` (vacío).

Crear `backend/apps/fiscal/models.py`:
```python
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class FiscalDocument(TimeStampedModel):
    class FiscalStatus(models.TextChoices):
        PENDING = "pending", "Pendiente"
        AUTHORIZED = "authorized", "Autorizada"
        REJECTED = "rejected", "Rechazada"
        CANCELLED = "cancelled", "Anulada"

    class Environment(models.TextChoices):
        DEMO = "demo", "Demo / Pruebas"
        PRODUCTION = "production", "Producción"

    invoice = models.OneToOneField(
        "billing.Invoice", on_delete=models.CASCADE, related_name="fiscal"
    )
    cufe = models.CharField(max_length=120)
    protocol = models.CharField(max_length=60, blank=True)
    fiscal_status = models.CharField(
        max_length=20, choices=FiscalStatus.choices, default=FiscalStatus.AUTHORIZED
    )
    environment = models.CharField(
        max_length=20, choices=Environment.choices, default=Environment.DEMO
    )
    provider = models.CharField(max_length=20, default="demo")
    issued_at = models.DateTimeField(default=timezone.now)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.cufe} ({self.fiscal_status})"
```

- [ ] **Step 2: Registrar el app y el setting**

En `backend/config/settings/base.py`, en la lista `LOCAL_APPS`, agregar `"apps.fiscal",` después de `"apps.billing",`.

En el mismo archivo, al final de la sección de settings propios (después de las definiciones de apps), agregar:
```python
# Proveedor de factura electrónica: "demo" (simulado) o "hka" (real, futuro).
FISCAL_PROVIDER = "demo"
```

- [ ] **Step 3: Agregar la dependencia `qrcode` y reconstruir la imagen**

En `backend/requirements.txt`, agregar una línea:
```
qrcode==8.0
```
Reconstruir y levantar el backend:
```bash
docker compose build backend
docker compose up -d backend
```

- [ ] **Step 4: Generar y aplicar la migración**

```bash
docker compose exec -T backend python manage.py makemigrations fiscal
docker compose exec -T backend python manage.py migrate
```
Expected: crea `apps/fiscal/migrations/0001_initial.py` (modelo `FiscalDocument`) y la aplica OK.

- [ ] **Step 5: Escribir y correr el test de modelo**

Crear `backend/apps/fiscal/tests/__init__.py` (vacío) y `backend/apps/fiscal/tests/test_models.py`:
```python
import pytest

from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.fiscal.models import FiscalDocument

pytestmark = pytest.mark.django_db


def test_fiscal_document_str_and_defaults():
    customer = Customer.objects.create(name="Cliente FEL")
    invoice = Invoice.objects.create(customer=customer)
    doc = FiscalDocument.objects.create(invoice=invoice, cufe="FE" + "a" * 64)
    assert doc.fiscal_status == FiscalDocument.FiscalStatus.AUTHORIZED
    assert doc.environment == FiscalDocument.Environment.DEMO
    assert str(doc).startswith("FE")
    assert invoice.fiscal == doc
```

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_models.py -q`
Expected: 1 test PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/fiscal/ backend/config/settings/base.py backend/requirements.txt
git commit -m "feat(fiscal): app fiscal con modelo FiscalDocument y dependencia qrcode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Proveedor enchufable + servicios emit/void

**Files:**
- Create: `backend/apps/fiscal/providers/__init__.py`, `base.py`, `demo.py`
- Create: `backend/apps/fiscal/services.py`
- Test: `backend/apps/fiscal/tests/test_services.py`

**Interfaces:**
- Consumes: `FiscalDocument` (Task 1), `billing.Invoice`.
- Produces: `get_provider() -> FiscalProvider`; `FiscalProvider.emit(invoice) -> EmitResult{cufe,protocol,status,environment}` y `.void(doc)`; `emit_fiscal_document(*, invoice, user=None) -> FiscalDocument`; `void_fiscal_document(*, invoice) -> None`.

- [ ] **Step 1: Crear la interfaz del proveedor**

Crear `backend/apps/fiscal/providers/base.py`:
```python
from dataclasses import dataclass


@dataclass
class EmitResult:
    cufe: str
    protocol: str
    status: str
    environment: str


class FiscalProvider:
    name = "base"

    def emit(self, invoice) -> EmitResult:
        raise NotImplementedError

    def void(self, doc) -> None:
        raise NotImplementedError
```

Crear `backend/apps/fiscal/providers/demo.py`:
```python
import hashlib
import time

from .base import EmitResult, FiscalProvider


class DemoProvider(FiscalProvider):
    """Simula HKA: genera un CUFE/protocolo falsos, sin validez fiscal."""

    name = "demo"

    def emit(self, invoice) -> EmitResult:
        seed = f"{invoice.id}-{invoice.invoice_number}-{time.time_ns()}"
        digest = hashlib.sha256(seed.encode()).hexdigest()  # 64 hex
        cufe = f"FE{digest}"  # ~66 caracteres, formato realista
        protocol = str(int(digest[:12], 16))
        return EmitResult(
            cufe=cufe, protocol=protocol, status="authorized", environment="demo"
        )

    def void(self, doc) -> None:
        return None
```

Crear `backend/apps/fiscal/providers/__init__.py`:
```python
from django.conf import settings

from .base import EmitResult, FiscalProvider
from .demo import DemoProvider

_PROVIDERS = {"demo": DemoProvider}


def get_provider() -> FiscalProvider:
    name = getattr(settings, "FISCAL_PROVIDER", "demo")
    return _PROVIDERS.get(name, DemoProvider)()


__all__ = ["EmitResult", "FiscalProvider", "DemoProvider", "get_provider"]
```

- [ ] **Step 2: Escribir el test de servicios (falla primero)**

Crear `backend/apps/fiscal/tests/test_services.py`:
```python
import pytest

from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.fiscal.models import FiscalDocument
from apps.fiscal.services import emit_fiscal_document, void_fiscal_document
from rest_framework.exceptions import ValidationError

pytestmark = pytest.mark.django_db


def _issued_invoice():
    customer = Customer.objects.create(name="Cliente FEL")
    return Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)


def test_emit_creates_authorized_document_with_cufe():
    invoice = _issued_invoice()
    doc = emit_fiscal_document(invoice=invoice)
    assert doc.cufe.startswith("FE") and len(doc.cufe) > 40
    assert doc.fiscal_status == FiscalDocument.FiscalStatus.AUTHORIZED
    assert doc.environment == "demo"


def test_emit_rejects_draft_invoice():
    customer = Customer.objects.create(name="C")
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.DRAFT)
    with pytest.raises(ValidationError):
        emit_fiscal_document(invoice=invoice)


def test_emit_rejects_double_emission():
    invoice = _issued_invoice()
    emit_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    with pytest.raises(ValidationError):
        emit_fiscal_document(invoice=invoice)


def test_emit_generates_unique_cufes():
    a = emit_fiscal_document(invoice=_issued_invoice())
    b = emit_fiscal_document(invoice=_issued_invoice())
    assert a.cufe != b.cufe


def test_void_marks_cancelled():
    invoice = _issued_invoice()
    emit_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    void_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    assert invoice.fiscal.fiscal_status == FiscalDocument.FiscalStatus.CANCELLED
    assert invoice.fiscal.cancelled_at is not None
```

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_services.py -q`
Expected: FAIL (`services.py` no existe aún → ImportError).

- [ ] **Step 3: Implementar los servicios**

Crear `backend/apps/fiscal/services.py`:
```python
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import Invoice

from .models import FiscalDocument
from .providers import get_provider


def emit_fiscal_document(*, invoice, user=None) -> FiscalDocument:
    if invoice.status in (Invoice.Status.DRAFT, Invoice.Status.CANCELLED):
        raise ValidationError(
            {"status": "Solo se emite FEL de una factura emitida (no borrador ni cancelada)."}
        )
    existing = getattr(invoice, "fiscal", None)
    if existing and existing.fiscal_status != FiscalDocument.FiscalStatus.CANCELLED:
        raise ValidationError({"detail": "La factura ya tiene un documento fiscal."})

    provider = get_provider()
    result = provider.emit(invoice)
    if existing:
        existing.delete()
    return FiscalDocument.objects.create(
        invoice=invoice,
        cufe=result.cufe,
        protocol=result.protocol,
        fiscal_status=result.status,
        environment=result.environment,
        provider=provider.name,
    )


def void_fiscal_document(*, invoice) -> None:
    doc = getattr(invoice, "fiscal", None)
    if not doc or doc.fiscal_status == FiscalDocument.FiscalStatus.CANCELLED:
        return
    get_provider().void(doc)
    doc.fiscal_status = FiscalDocument.FiscalStatus.CANCELLED
    doc.cancelled_at = timezone.now()
    doc.save(update_fields=["fiscal_status", "cancelled_at", "updated_at"])
```

- [ ] **Step 4: Correr el test de servicios**

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_services.py -q`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/fiscal/providers/ backend/apps/fiscal/services.py backend/apps/fiscal/tests/test_services.py
git commit -m "feat(fiscal): proveedor enchufable demo y servicios emit/void

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: CAFE — PDF fiscal simulado con QR

**Files:**
- Create: `backend/apps/fiscal/cafe.py`
- Test: `backend/apps/fiscal/tests/test_cafe.py`

**Interfaces:**
- Consumes: `FiscalDocument` (vía `invoice.fiscal`), `apps.core.models.CompanyProfile`, `qrcode`, ReportLab.
- Produces: `render_cafe(invoice, download=False) -> HttpResponse` (PDF; `%PDF`; lleva la marca DEMO + QR + CUFE).

- [ ] **Step 1: Escribir el test del CAFE (falla primero)**

Crear `backend/apps/fiscal/tests/test_cafe.py`:
```python
import pytest

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer
from apps.fiscal.cafe import render_cafe
from apps.fiscal.services import emit_fiscal_document

pytestmark = pytest.mark.django_db


def _invoice_with_fiscal():
    customer = Customer.objects.create(name="Cliente FEL", identification_number="155-1", dv="22")
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED, total=100)
    InvoiceLine.objects.create(invoice=invoice, description="Servicio", quantity=1, unit_price=100, total=100)
    emit_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    return invoice


def test_render_cafe_returns_pdf():
    invoice = _invoice_with_fiscal()
    response = render_cafe(invoice)
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_render_cafe_download_is_attachment():
    invoice = _invoice_with_fiscal()
    response = render_cafe(invoice, download=True)
    assert "attachment" in response["Content-Disposition"]
```

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_cafe.py -q`
Expected: FAIL (`cafe.py` no existe → ImportError).

- [ ] **Step 2: Implementar el generador de CAFE**

Crear `backend/apps/fiscal/cafe.py`:
```python
from io import BytesIO

import qrcode
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.core.models import CompanyProfile


def _money(value):
    return f"${(value or 0):,.2f}"


def _qr_flowable(data):
    img = qrcode.make(data)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=3 * cm, height=3 * cm)


def render_cafe(invoice, download=False) -> HttpResponse:
    company = CompanyProfile.load()
    doc_obj = invoice.fiscal
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8)
    demo = ParagraphStyle(
        "demo", parent=styles["Title"], textColor=colors.red, fontSize=12
    )

    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, title=f"CAFE {invoice.invoice_number}")
    story = []

    story.append(Paragraph(company.name or "Empresa", styles["Title"]))
    story.append(Paragraph("CAFE — Comprobante Auxiliar de Factura Electrónica", styles["Heading3"]))
    story.append(Paragraph("DEMO — sin validez fiscal", demo))
    story.append(Spacer(1, 10))

    cust = invoice.customer
    ident = f"{cust.identification_number}" + (f"-{cust.dv}" if cust.dv else "")
    info = [
        ["Factura:", invoice.invoice_number, "Fecha:", str(invoice.issue_date)],
        ["Cliente:", cust.name, "RUC/Cédula:", ident or "—"],
    ]
    info_table = Table(info, colWidths=[2.5 * cm, 7 * cm, 2.5 * cm, 5 * cm])
    info_table.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9)]))
    story.append(info_table)
    story.append(Spacer(1, 10))

    rows = [["Descripción", "Cant.", "Precio", "Total"]]
    for line in invoice.lines.all():
        rows.append([line.description, str(line.quantity), _money(line.unit_price), _money(line.total)])
    rows.append(["", "", "Total", _money(invoice.total)])
    items = Table(rows, colWidths=[9 * cm, 2 * cm, 3 * cm, 3 * cm])
    items.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c7c54")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ]
        )
    )
    story.append(items)
    story.append(Spacer(1, 14))

    story.append(_qr_flowable(doc_obj.cufe))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>CUFE:</b> {doc_obj.cufe}", small))
    story.append(Paragraph(f"<b>Protocolo de autorización:</b> {doc_obj.protocol}", small))
    story.append(Paragraph(f"<b>Estado:</b> {doc_obj.get_fiscal_status_display()} (ambiente {doc_obj.environment})", small))

    pdf.build(story)
    buf.seek(0)

    response = HttpResponse(buf.getvalue(), content_type="application/pdf")
    disposition = "attachment" if download else "inline"
    response["Content-Disposition"] = f'{disposition}; filename="CAFE-{invoice.invoice_number}.pdf"'
    return response
```

- [ ] **Step 3: Correr el test del CAFE**

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_cafe.py -q`
Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/fiscal/cafe.py backend/apps/fiscal/tests/test_cafe.py
git commit -m "feat(fiscal): generador de CAFE (PDF con QR y marca demo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: API — acciones emit-fiscal/cafe + serializer + anulación

**Files:**
- Modify: `backend/apps/billing/views.py` (InvoiceViewSet: acciones + cancel)
- Modify: `backend/apps/billing/serializers.py` (InvoiceSerializer: campo `fiscal`)
- Test: `backend/apps/fiscal/tests/test_api.py`

**Interfaces:**
- Consumes: `emit_fiscal_document`, `void_fiscal_document` (Task 2), `render_cafe` (Task 3).
- Produces: `POST /api/invoices/{id}/emit-fiscal/`, `GET /api/invoices/{id}/cafe/`; `InvoiceSerializer.fiscal` (dict o null); `cancel` anula el documento fiscal.

- [ ] **Step 1: Escribir el test de API (falla primero)**

Crear `backend/apps/fiscal/tests/test_api.py`:
```python
import pytest
from rest_framework.test import APIClient

from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="a@test.com", password="x", role="general_admin", full_name="A B"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def issued_invoice():
    customer = Customer.objects.create(name="Cliente FEL")
    return Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)


def test_emit_fiscal_action_and_serializer_fields(admin_client, issued_invoice):
    res = admin_client.post(f"/api/invoices/{issued_invoice.id}/emit-fiscal/")
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["fiscal"]["cufe"].startswith("FE")
    assert body["fiscal"]["status"] == "authorized"


def test_cafe_download(admin_client, issued_invoice):
    admin_client.post(f"/api/invoices/{issued_invoice.id}/emit-fiscal/")
    res = admin_client.get(f"/api/invoices/{issued_invoice.id}/cafe/")
    assert res.status_code == 200
    assert res["Content-Type"] == "application/pdf"
    assert res.content[:4] == b"%PDF"


def test_cafe_404_without_fiscal(admin_client, issued_invoice):
    res = admin_client.get(f"/api/invoices/{issued_invoice.id}/cafe/")
    assert res.status_code == 400


def test_cancel_voids_fiscal_document(admin_client, issued_invoice):
    admin_client.post(f"/api/invoices/{issued_invoice.id}/emit-fiscal/")
    admin_client.post(f"/api/invoices/{issued_invoice.id}/cancel/")
    issued_invoice.refresh_from_db()
    assert issued_invoice.fiscal.fiscal_status == "cancelled"


def test_serializer_fiscal_null_when_not_emitted(admin_client, issued_invoice):
    res = admin_client.get(f"/api/invoices/{issued_invoice.id}/")
    assert res.status_code == 200
    assert res.json()["fiscal"] is None
```

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_api.py -q`
Expected: FAIL (las acciones y el campo `fiscal` no existen aún).

- [ ] **Step 2: Agregar el campo `fiscal` al InvoiceSerializer**

En `backend/apps/billing/serializers.py`, en `InvoiceSerializer`, agregar el método y el campo. Tras la línea `customer_whatsapp = serializers.CharField(... )` (cierre del paréntesis), agregar:
```python
    fiscal = serializers.SerializerMethodField()

    def get_fiscal(self, obj):
        doc = getattr(obj, "fiscal", None)
        if not doc:
            return None
        return {
            "cufe": doc.cufe,
            "status": doc.fiscal_status,
            "status_display": doc.get_fiscal_status_display(),
            "protocol": doc.protocol,
            "environment": doc.environment,
            "issued_at": doc.issued_at,
        }
```
Y en la tupla `fields = (...)` del `Meta`, agregar `"fiscal",` (p. ej. después de `"payments",`).

- [ ] **Step 3: Agregar las acciones y la anulación en InvoiceViewSet**

En `backend/apps/billing/views.py`, dentro de `InvoiceViewSet`, agregar dos acciones (por ejemplo después de la acción `pdf`):
```python
    @action(detail=True, methods=["post"], url_path="emit-fiscal")
    def emit_fiscal(self, request, pk=None):
        from apps.fiscal.services import emit_fiscal_document

        invoice = self.get_object()
        emit_fiscal_document(invoice=invoice, user=request.user)
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get"])
    def cafe(self, request, pk=None):
        from apps.fiscal.cafe import render_cafe

        invoice = self.get_object()
        if getattr(invoice, "fiscal", None) is None:
            raise ValidationError({"detail": "La factura no tiene documento fiscal."})
        download = request.query_params.get("download") in ("1", "true", "yes")
        return render_cafe(invoice, download=download)
```
En la acción `cancel` del mismo viewset, **antes** de `return`, después de `invoice.save(update_fields=["status", "updated_at"])`, agregar:
```python
        from apps.fiscal.services import void_fiscal_document

        void_fiscal_document(invoice=invoice)
```

- [ ] **Step 4: Correr el test de API**

Run: `docker compose exec -T backend pytest apps/fiscal/tests/test_api.py -q`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/billing/views.py backend/apps/billing/serializers.py backend/apps/fiscal/tests/test_api.py
git commit -m "feat(fiscal): endpoints emit-fiscal/cafe, campo fiscal en serializer y anulacion al cancelar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verificación de la suite completa

**Files:** (sin cambios salvo correcciones de regresión)

- [ ] **Step 1: Correr toda la suite del backend**

Run: `docker compose exec -T backend pytest -q`
Expected: toda la suite PASS (los ~366 previos + los nuevos de fiscal). Si algún test de billing se ve afectado por el nuevo campo `fiscal` del serializer o por la anulación en `cancel`, corregirlo con el cambio mínimo y re-correr.

- [ ] **Step 2: Verificar el endpoint en vivo (sin auth → 401, no 500)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/invoices/
```
Expected: `401` (confirma que el serializer con el campo `fiscal` y las acciones cargan sin romper).

- [ ] **Step 3: Commit (si hubo correcciones)**

```bash
git add -A
git commit -m "test(fiscal): ajustar regresiones tras la capa fiscal demo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Omitir si no hubo cambios.)

---

## Self-Review

- **Spec coverage:** app `apps/fiscal` + `FiscalDocument` (Task 1), proveedor enchufable demo + servicios emit/void (Task 2), CAFE con QR + marca DEMO (Task 3), endpoints emit-fiscal/cafe + campo `fiscal` + anulación al cancelar (Task 4), regresión (Task 5). Cubierto.
- **Placeholder scan:** sin TBD/TODO; código completo.
- **Type consistency:** `FiscalDocument.related_name="fiscal"` usado en serializer (`get_fiscal`), CAFE (`invoice.fiscal`) y servicios (`getattr(invoice, "fiscal", None)`); `emit_fiscal_document`/`void_fiscal_document` con firmas keyword-only consistentes entre tests, servicios y viewset; `get_provider()` lee `settings.FISCAL_PROVIDER`.
- **Nota dep/migración:** Task 1 agrega `qrcode` (rebuild) y la migración `fiscal.0001`; correr `migrate` antes de probar en vivo.
