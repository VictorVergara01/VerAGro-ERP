# Factura Electrónica HKA (modo DEMO) — Design

**Fecha:** 2026-06-22
**Rama:** V2.0 (no se mergea a master sin pedido explícito)
**Estado:** Aprobado por el usuario, listo para plan.
**Ref de investigación:** `docs/superpowers/refs/2026-06-21-hka-facturacion-electronica.md`

## Objetivo

Simular el flujo de **Factura Electrónica de Panamá (FEL)** dentro del ERP, **sin** llamar a HKA ni
requerir credenciales, para poder mostrar y probar la experiencia completa (emitir documento fiscal →
CUFE → CAFE con QR → anulación). Se construye con un **proveedor enchufable** para que, cuando se
tengan las credenciales reales de HKA, se cambie `demo → hka` sin rehacer modelo ni UI.

## Decisiones del usuario (brainstorming)

1. **Demo simulado (mock interno):** genera CUFE/CAFE falsos; NO llama a HKA; NO requiere credenciales.
2. **Disparador:** botón explícito **"Emitir Factura Electrónica (demo)"** (tras emitir la factura), no automático.
3. **Alcance:** **solo web** (el móvil no se toca).
4. **QR real en el CAFE:** sí → nueva dependencia `qrcode` (rebuild de imagen backend).

## Arquitectura

App nuevo y aislado **`apps/fiscal/`**. El módulo `billing` lo invoca; `fiscal` no depende de la UI.
La pieza clave es un **proveedor enchufable**: la lógica de emisión no sabe si es demo o HKA real.

### Modelo `FiscalDocument` (`apps/fiscal/models.py`)

OneToOne con `billing.Invoice` (`related_name="fiscal"`, `on_delete=CASCADE`):

| Campo | Tipo | Notas |
|---|---|---|
| `invoice` | OneToOneField → `billing.Invoice` | una factura tiene a lo sumo un documento fiscal |
| `cufe` | CharField(120) | Código Único Fiscal Electrónico (demo: ~64 hex realistas) |
| `protocol` | CharField(60) blank | protocolo de autorización (demo: número) |
| `fiscal_status` | choices `pending`/`authorized`/`rejected`/`cancelled` | demo: queda `authorized` al emitir; `cancelled` al anular |
| `environment` | choices `demo`/`production` | demo: `demo` |
| `provider` | CharField(20) | `demo` (mañana `hka`) |
| `issued_at` | DateTimeField | momento de emisión fiscal |
| `cancelled_at` | DateTimeField null/blank | momento de anulación |
| timestamps | (de TimeStampedModel) | |

### Proveedor enchufable (`apps/fiscal/providers/`)

- `base.py`: clase abstracta `FiscalProvider` con `emit(invoice) -> EmitResult` y `void(doc) -> None`.
  `EmitResult` = dataclass `{cufe, protocol, status, environment}`.
- `demo.py`: `DemoProvider`:
  - `emit`: genera un **CUFE falso realista** (p. ej. `"FE"` + 64 hex de `uuid4().hex` repetido/truncado o
    un sha256 del id+timestamp), un `protocol` (número), `status="authorized"`, `environment="demo"`.
    Determinístico-no-requerido; debe ser único.
  - `void`: no hace nada externo (la anulación solo cambia el estado en BD).
- `get_provider()` lee `settings.FISCAL_PROVIDER` (default `"demo"`) y devuelve la instancia. Este es el
  punto de enchufe del cliente SOAP de HKA real (futuro `hka.py`).

### Servicios (`apps/fiscal/services.py`)

- `emit_fiscal_document(*, invoice, user=None) -> FiscalDocument`:
  - valida que `invoice.status` sea emitida (NO `draft`, NO `cancelled`); si no, `ValidationError`.
  - valida que no exista ya un `FiscalDocument` con `fiscal_status != cancelled`; si existe, `ValidationError`
    ("La factura ya tiene un documento fiscal").
  - llama `get_provider().emit(invoice)`, crea y devuelve el `FiscalDocument`.
- `void_fiscal_document(*, invoice) -> None`: si la factura tiene un `FiscalDocument` autorizado, llama
  `provider.void(doc)` y lo marca `cancelled` + `cancelled_at`. Idempotente / no falla si no hay doc.

### CAFE — PDF fiscal simulado (`apps/fiscal/cafe.py`)

- `render_cafe(invoice) -> bytes`: PDF (ReportLab, como el `billing/pdf.py` actual) con: datos del emisor
  (`CompanyProfile`), receptor (cliente con RUC/cédula), ítems con ITBMS, totales, **CUFE**, protocolo,
  fecha, un **código QR** (lib `qrcode`, encodea el CUFE o una URL demo) y una **marca visible
  "DEMO — Ambiente de pruebas (sin validez fiscal)"**. Reutiliza helpers de estilo de `billing/pdf.py`
  donde aplique (sin acoplar; copiar/compartir lo mínimo).

## API (acciones en `billing.InvoiceViewSet`, lógica en `apps/fiscal`)

- `POST /api/invoices/{id}/emit-fiscal/` → `emit_fiscal_document`; devuelve la factura serializada (con
  datos fiscales). Permiso: igual que emitir factura (`BILLING_WRITE` = admins + sales).
- `GET /api/invoices/{id}/cafe/` → `render_cafe`; responde el PDF (inline; `?download=1` → attachment),
  igual patrón que el endpoint `pdf` actual. 404/400 si la factura no tiene documento fiscal.
- Anulación: el flujo de `cancel` de la factura llama `void_fiscal_document` (anulación demo) si aplica.

### Serializer (`billing.InvoiceSerializer`)

Agrega campos read-only derivados del `FiscalDocument` (o null si no existe):
`cufe`, `fiscal_status`, `fiscal_status_display`, `fiscal_protocol`, `fiscal_issued_at`, `fiscal_environment`.

## Web — tarjeta "Factura Electrónica" en `InvoiceDetailPage`

- Visible cuando la factura está **emitida** (status ∈ {issued, partially_paid, paid}) y **no cancelada**.
- Si **no** tiene CUFE: botón **"Emitir Factura Electrónica (demo)"** → `POST emit-fiscal`, con notificación.
- Si **ya** tiene CUFE: muestra **CUFE**, **estado "Autorizada (demo)"** (badge), **protocolo**, **fecha**,
  un **badge DEMO**, y botón **"Descargar CAFE"** (fetch autenticado del PDF, como el "Descargar PDF" actual
  en `features/billing/documents.ts`).

## Dependencias

- Nueva: **`qrcode`** (genera el QR; usa Pillow, ya instalado). Agregar a `requirements.txt` y **rebuild de
  la imagen del backend** (`docker compose build backend`).

## Lo que NO incluye (YAGNI / fuera de alcance)

- Llamadas reales a HKA/DGI, SOAP, WSDL, autenticación, certificados.
- Notas de crédito/débito fiscales, reintentos, manejo de rechazos DGI reales.
- Móvil (el estado fiscal no se muestra en la app).
- Reemplazar el PDF comercial actual: el `pdf` de `billing` se queda; el CAFE es un documento aparte.

## Testing

- Backend (pytest): `emit_fiscal_document` crea el doc con CUFE/estado authorized; rechaza factura draft
  (400) y cancelada (400); rechaza doble emisión (400); `void_fiscal_document` marca cancelled; el
  endpoint `emit-fiscal` (201/200) y `cafe` (200, `%PDF`); el serializer expone los campos fiscales.
  El `DemoProvider.emit` genera CUFEs únicos.
- Web (vitest): la tarjeta muestra el botón "Emitir…" cuando no hay CUFE y los datos + "Descargar CAFE"
  cuando sí; la acción dispara la mutación.

## Constraints globales

- Rama `V2.0`; **no** mergear a master sin pedido explícito.
- `FISCAL_PROVIDER` default `"demo"`; el CAFE siempre lleva la marca "DEMO — sin validez fiscal".
- Tras agregar dependencia o migración, rebuild/migrate del backend antes de probar en vivo
  (ver [[backend-autoreload-windows]]); reiniciar el dev server de Vite tras cambios web.
- Commits en español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
