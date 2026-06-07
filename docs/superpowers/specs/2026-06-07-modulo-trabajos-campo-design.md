# Módulo de Trabajos de Campo (Fumigación / Esparcido) — Diseño

**Fecha:** 2026-06-07
**Estado:** Aprobado por el usuario; pendiente de plan de implementación.
**Alcance de este sub-proyecto:** Backend + Frontend web. (Móvil = sub-proyecto siguiente.)

## Contexto y problema

El ERP Veragro cubre hoy el **mantenimiento/reparación** de drones (órdenes de servicio),
pero no el **trabajo de campo** que es el negocio principal: fumigar y esparcir abono con
los drones para clientes. La empresa tiene dos drones y cobra:

- **Fumigación:** $20–25 por **hectárea** (base $20/ha).
- **Esparcido / abono al voleo:** $10–15 por **quintal (qq)** lanzado (base $10/qq).

El precio es editable por trabajo, pero parte de un valor base. Hace falta registrar cada
trabajo (cuántas hectáreas o quintales, a qué precio), generar la factura al cliente y poder
consultar el historial y los ingresos por fumigación.

## Decisiones tomadas (brainstorming)

1. **Facturación:** al cerrar el trabajo se **genera factura automática**, integrada al
   módulo de Facturas y a los reportes de ventas (mismo flujo que las órdenes de servicio).
2. **Cálculo del total:** Fumigación = `hectáreas × precio/ha`; Esparcido = `quintales × precio/qq`.
   En esparcido las hectáreas son un dato opcional (informativo), no afectan el cobro.
3. **Datos capturados:** dron usado, cliente + finca/ubicación, cultivo y producto aplicado
   (texto libre, **sin descontar inventario**), fecha y operador/técnico.
4. **Flujo:** con agenda — `programado` → `hecho` → `facturado` (+ `cancelado`).
5. **Precios base:** **editables en Configuración** (prellenan el formulario; ajustables por trabajo).

## Enfoque elegido

Módulo nuevo `apps.field_jobs` con su modelo `FieldJob`, espejando el patrón
orden→factura ya probado. Se añade un `InvoiceType` propio para separar en Facturas y
Reportes los *ingresos por fumigación* de las reparaciones/ventas.

Se descartó extender `service_orders` (carga piezas/checklists/10 estados que no aplican a
fumigar) y el enfoque mínimo sin modelo (perdería el historial filtrable por dron/cliente/fecha
y el reporte de hectáreas/quintales).

## Backend — `apps.field_jobs`

### Modelo `FieldJob` (hereda `TimeStampedModel`)

| Campo | Tipo | Notas |
|---|---|---|
| `number` | Char único, blank | Autogenerado `TC-NNNNNN` en `save()` (patrón de `ServiceOrder`/`Invoice`). |
| `job_type` | choices | `fumigation` (Fumigación) \| `spreading` (Esparcido/abono). |
| `status` | choices | `scheduled` (Programado) → `done` (Hecho) → `invoiced` (Facturado); `cancelled` (Cancelado). Default `scheduled`. |
| `customer` | FK PROTECT | A quién se factura. |
| `equipment` | FK PROTECT, null/blank | El dron usado. |
| `technician` | FK users SET_NULL, null/blank | Operador. |
| `scheduled_date` | Date | Fecha programada (default hoy). |
| `done_date` | Date, null/blank | Se setea al marcar hecho. |
| `location` | Char/Text, blank | Finca / lote / ubicación. |
| `crop` | Char, blank | Cultivo (texto libre). |
| `applied_product` | Char, blank | Producto aplicado (texto libre; **no** toca inventario). |
| `hectares` | Decimal, default 0 | Base de cobro en fumigación; informativo en esparcido. |
| `quintals` | Decimal, default 0 | Base de cobro en esparcido. |
| `unit_price` | Decimal, default 0 | $/ha o $/qq; se prellena desde Configuración, editable por trabajo. |
| `total` | Decimal, default 0 | **Derivado** (read-only en API), recalculado en el servidor. |
| `notes` | Text, blank | |
| `created_by` | FK users SET_NULL, null/blank | |

`Meta.ordering = ("-created_at",)`. `__str__` → `number`.

**Regla de cálculo** (`recalculate_total`):
- `fumigation` → `total = hectares × unit_price`
- `spreading`  → `total = quintals × unit_price`

### Servicios (`field_jobs/services.py`, atómicos)

- `recalculate_total(job)` — aplica la regla anterior y guarda `total`. Se invoca en
  `perform_create`/`perform_update` del viewset (igual que `recalculate_totals` en órdenes,
  para que el total no quede en 0 al crear).
- `mark_done(job)` — `scheduled` → `done`, setea `done_date = hoy`. Bloquea si no está
  `scheduled`.
- `cancel_job(job)` — pasa a `cancelled`. Bloquea si ya está `invoiced`.

### Facturación (`apps.billing`)

- **Nuevo** `Invoice.InvoiceType.FIELD_JOB = "field_job"` → "Factura de fumigación".
- **Nueva FK** `Invoice.field_job` → `field_jobs.FieldJob`, `on_delete=SET_NULL`,
  null/blank, `related_name="invoices"` (igual que `service_order`).
- `Invoice.save()` — extender el prefijo: `field_job` → **`FUM-NNNNNN`**
  (hoy: `service_invoice` → `OS-`, resto → `FAC-`).
- **Nuevo servicio** `billing.services.create_invoice_from_field_job(*, job, user=None)`
  (espeja `create_invoice_from_service_order`):
  - Exige `job.status == DONE` (solo se factura un trabajo hecho).
  - Rechaza doble facturación (`job.invoices.exclude(status=CANCELLED).exists()`).
  - Crea `Invoice(invoice_type=FIELD_JOB, customer=job.customer, field_job=job, created_by=user)`
    con `tax_percentage=0`/`discount_percentage=0` (ajustables luego en la factura borrador).
  - Crea **una** `InvoiceLine`:
    - `quantity` = `hectares` (fumigación) / `quintals` (esparcido);
    - `unit_price` = `job.unit_price`;
    - `description` = p. ej. `"Fumigación 12.5 ha @ $20.00/ha — Finca La Esperanza"`
      (incluye tipo, cantidad+unidad, precio y `location` si existe);
    - `line_type` = `InvoiceLine.LineType.SERVICE` (`"service"`, ya existente).
  - `recalculate_invoice(invoice)` y deja `job.status = invoiced`.

### API `/api/field-jobs/` (`field_jobs/views.py`, `serializers.py`)

- `FieldJobViewSet` (ModelViewSet) con `RoleWriteOrReadOnly("admin", "technician")`
  (lectura para todo autenticado).
- Serializer: `total` **read-only**; incluye `customer_name`, `equipment_name`,
  `technician_name`, `job_type_display`, `status_display` (read-only, patrón `source="...name"`).
- `perform_create`/`perform_update` → `recalculate_total`.
- **Acciones** (`@action detail=True, methods=["post"]`):
  - `mark-done` → `mark_done`, devuelve el job.
  - `generate-invoice` → `create_invoice_from_field_job`, devuelve la factura creada.
  - `cancel` → `cancel_job`.
- **Filtros** por query param: `?customer=`, `?equipment=`, `?technician=`, `?status=`,
  `?job_type=`, `?from=&to=` (rango sobre `scheduled_date`; fecha inválida → 400, patrón de reportes).
- **Búsqueda** (`?search=`): `number`, `location`, `crop`, `customer__name`.
- Paginación estándar (envelope `{count, results}`).

### Configuración (`apps.core.CompanyProfile`)

Dos campos nuevos (Decimal):
- `fumigation_price_per_hectare` (default `20`).
- `spreading_price_per_quintal` (default `10`).

Expuestos en `/api/company/` (ya editable por admin) y usados por el frontend para prellenar
el formulario.

### Migraciones

- `field_jobs.0001_initial` (modelo `FieldJob`).
- `billing.000X` — nuevo choice `field_job` en `invoice_type` + FK `field_job`.
- `core.000X` — dos campos de precio en `CompanyProfile`.

### Tests (pytest)

- `FieldJob`: autogeneración de `number` (`TC-`), `recalculate_total` para ambos tipos
  (fumigación usa ha, esparcido usa qq; el otro campo no afecta el total).
- Transiciones: `mark_done` (bloquea si no `scheduled`), `cancel_job` (bloquea si `invoiced`).
- `create_invoice_from_field_job`: exige `done`, rechaza doble factura, línea correcta
  (cantidad/precio/descripción), factura tipo `field_job` con número `FUM-`, job → `invoiced`.
- API: CRUD, filtros (`?job_type=`, `?status=`, `?from=&to=` con 400 en fecha inválida),
  permisos (technician escribe, readonly solo lee), acciones.

## Frontend web — `features/field-jobs/`

Sigue el patrón establecido (ver `features/service-orders/`): `types.ts`, `api.ts`
(hooks `useQuery`/`useMutation` que invalidan `["field-jobs"]`), `FieldJobsPage.tsx`,
`FieldJobFormModal.tsx`, `FieldJobDetailPage.tsx`.

- **`FieldJobsPage`** — lista en `DataTable` (Card): columnas número, tipo, cliente, fecha,
  ha/qq, total, estado (badge). Toolbar: búsqueda + filtros (tipo, estado, rango de fechas).
  Footer: paginación. Fila clicable → detalle. Botón "Nuevo trabajo".
- **`FieldJobFormModal`** — `@mantine/form`:
  - *Segmented* Fumigación / Esparcido → muestra el campo **Hectáreas** (fumigación) o
    **Quintales** (esparcido); el otro queda opcional/oculto.
  - Selects: cliente (`useCustomers`), dron (`useEquipmentList` filtrado a tipo *Drone agrícola*),
    operador (`useTechnicians`).
  - Textos: finca/ubicación, cultivo, producto aplicado, notas. Fecha (`<input type=date>`).
  - `unit_price` **prellenado** desde `useCompanyProfile` (`fumigation_price_per_hectare` /
    `spreading_price_per_quintal` según el tipo), editable. Muestra el total calculado en vivo.
- **`FieldJobDetailPage`** — `DetailHeader` + `Field`; datos completos y total. Botones según
  estado: **Marcar hecho** (`scheduled`), **Facturar** (`done` → navega a la factura creada),
  **Cancelar** (no `invoiced`). Enlace a la factura cuando exista.
- **Sidebar:** nueva entrada **"Trabajos de campo"** (grupo Menú). Ruta en `AppRoutes`.
- **Configuración:** en la pestaña **Empresa**, dos campos de precio base
  (fumigación $/ha, esparcido $/qq).
- **Tests Vitest:** render de la lista, del formulario (segmented cambia el campo y el precio
  prellenado), y del detalle (botones por estado). Mantener verde la suite.

## Integración y reportes

- Los trabajos facturados aparecen en **Facturas** (tipo *Factura de fumigación*, prefijo `FUM-`)
  y, al ser facturas reales, ya entran en **Reportes → Ventas**. El tipo propio permite
  distinguirlos de reparaciones/ventas de producto.
- (Opcional, follow-up) Tarjeta/desglose "Ingresos por fumigación" en el dashboard/reportes.

## Fuera de alcance (follow-ups)

- **App móvil** (registrar trabajos desde el campo) — **sub-proyecto siguiente**.
- Descuento/impuesto a nivel de trabajo (hoy la factura se crea sin impuesto y se ajusta en
  borrador si hace falta; ITBMS agrícola suele estar exento).
- Descontar el químico/abono de inventario (hoy es texto libre).
- Programación con calendario/recordatorios; múltiples drones por trabajo; mapa/coordenadas
  de la finca; áreas por polígono.
