# Trabajos de Campo (Fumigación) — Rebuild Design

**Fecha:** 2026-06-22
**Rama:** V2.0 (no se mergea a master sin pedido explícito)
**Estado:** Aprobado por el usuario, listo para plan.

## Objetivo

Reconstruir el módulo de Trabajos de Campo **limpio y enfocado en fumigación**, dejando el
espacio arquitectónico para desarrollar después el módulo de **sólidos (esparcido/granulado)**.
Se conserva la calculadora de mezcla ya construida y aprobada (tanque 200 L modificable, agua
autocalculada, lista de químicos en L/ha). Se elimina la carga heredada que no aplica a este
flujo.

## Decisiones del usuario (brainstorming)

1. **Precio/ha + facturar:** se mantiene precio por hectárea, total calculado y el flujo de
   generar factura desde el trabajo.
2. **Solo ubicación de texto:** se eliminan clima (viento/temp/humedad) y GPS (lat/long).
3. **Recrear limpio:** se rehace el esquema; se aceptan perder los 2 registros de prueba.
4. **Unidades de químico: L/ha y cc/ha** (líquidos; cc = mL).

## Modelo de datos

### `FieldJob` (recreado limpio)

| Campo | Tipo | Notas |
|---|---|---|
| `number` | CharField unique, autogenerado | `TC-NNNNNN` por pk, como hoy |
| `job_type` | choices `fumigation`/`spreading` | default `fumigation`. **Se conserva el enum**; solo se construye/expone fumigación. Espacio para sólidos. |
| `status` | choices `scheduled`/`done`/`invoiced`/`cancelled` | default `scheduled` |
| `customer` | FK → `customers.Customer` (PROTECT) | **Cliente** registrado en el ERP |
| `equipment` | FK → `equipment.Equipment` (PROTECT, null/blank) | **Dron** registrado |
| `technician` | FK → `users.User` (SET_NULL, null/blank) | **Piloto** registrado |
| `scheduled_date` | DateField default hoy | **Fecha** |
| `done_date` | DateField null/blank | se setea al marcar hecho |
| `location` | CharField(255) blank | **Ubicación** (texto libre) |
| `crop` | choices `rice`/`corn`/`pasture`/`other` | **Tipo de cultivo**: arroz/maíz/pasto/otros. default `rice` |
| `crop_other` | CharField(100) blank | texto libre cuando `crop == "other"` |
| `hectares` | DecimalField(10,4) default `1` | **Hectáreas** (modificable a más) |
| `unit_price` | DecimalField(12,2) default 0 | **Precio/ha** (default desde `CompanyProfile.fumigation_price_per_hectare`) |
| `total` | DecimalField(14,2) default 0 | derivado = `hectares × unit_price` |
| `tank_volume_liters` | DecimalField(10,2) null/blank | **Tanque de mezcla** (default 200 desde `CompanyProfile.drone_tank_volume_liters`) |
| `water_per_hectare` | DecimalField(10,2) null/blank | **Tasa de aplicación / caldo por hectárea** (lo ingresa el usuario) |
| `notes` | TextField blank | |
| `created_by` | FK → `users.User` (SET_NULL) | auditoría |

**Campos eliminados respecto al modelo actual:** `quintals`, `applied_product`,
`application_rate`, `application_rate_unit`, la clase `RateUnit`, `latitude`, `longitude`,
`wind_speed_kmh`, `temperature_celsius`, `humidity_percentage`, `weather_notes`.

`recalculate_total()`: `total = hectares × unit_price` (rama spreading queda como TODO/placeholder
para cuando exista el módulo de sólidos; por ahora solo fumigación calcula).

### `FieldJobProduct` (lista de químicos)

| Campo | Tipo | Notas |
|---|---|---|
| `field_job` | FK → FieldJob (CASCADE, related_name `products`) | |
| `name` | CharField(150) | nombre del químico |
| `dose_per_hectare` | DecimalField(10,4) default 0 | dosis por hectárea |
| `unit` | choices `L/ha`/`cc/ha`/`kg/ha`/`g/ha` | **La UI de fumigación solo ofrece L/ha y cc/ha**; kg/ha y g/ha quedan en el modelo reservados para sólidos. default `L/ha` |

**Límite:** hasta **10 químicos** por trabajo. Se valida en el serializer (error si se envían
más de 10) y la UI deshabilita "Agregar químico" al llegar a 10.

## Calculadora de mezcla (se conserva)

Endpoint `POST /api/field-jobs/calculate-mix/` y `services.calculate_mix`, **sin cambios de
lógica**:
- Entradas: `hectares`, `caldo_per_hectare` (la tasa de aplicación que ingresa el usuario),
  `tank_volume_liters` (default 200), `products: [{name, dose_per_hectare, unit}]`.
- `caldo total = hectares × caldo_per_hectare`.
- químico líquido = Σ (dosis_ha × hectares) de los productos cuya unidad base es litros (L/ha,
  cc/ha). Los granulados (kg/ha, g/ha) van aparte y **no afectan el volumen**.
- **agua = caldo total − químico líquido**.
- `tanks_needed = ceil(caldo_total / tank)`, reparto proporcional por tanque lleno + último
  tanque parcial. Resultado: `total_caldo_liters, liquid_chemical_liters, water_liters,
  tanks_needed, full_tanks, last_tank_liters, products_total[], per_full_tank[],
  water_per_full_tank, last_tank[], water_last_tank`.

## API

- `GET/POST /api/field-jobs/` y `GET/PATCH/DELETE /api/field-jobs/{id}/` — CRUD con `products`
  anidados escribibles; `customer_name`, `equipment_name`, `technician_name`,
  `crop_display` (label del cultivo) read-only para la UI.
- Acciones: `POST .../mark-done/` (→ `done`, setea `done_date`), `POST .../cancel/` (→
  `cancelled`), `POST .../generate-invoice/` (crea factura de servicio, → `invoiced`).
- `POST /api/field-jobs/calculate-mix/` — calculadora (sin cambios).
- Permisos: `RoleWriteOrReadOnly("admin","technician","sales")` (lectura para autenticados).
- Filtros: `?status=`, `?customer=`, `?technician=`, `?job_type=` (default lista solo
  fumigación en la UI; el backend acepta el filtro).

## Capas y fases

Reconstrucción **sobre el módulo existente** (no un módulo paralelo), por fases:

1. **Backend** — modelo limpio + migración de reset del esquema (drop de campos heredados, add
   de `crop`/`crop_other`, default de hectáreas a 1), serializers, services, viewset, tests.
2. **Web** (`frontend/src/features/field-jobs/`) — formulario (cliente, dron, piloto, fecha,
   ubicación, selector de cultivo con "otros", hectáreas, precio/ha, lista de hasta 10 químicos
   L/ha·cc/ha), `SprayMixModal` (sin cambios de cálculo), detalle, lista.
3. **Móvil** (`mobile/src/features/field-jobs/`) — formulario equivalente, `SprayCalculatorScreen`,
   detalle.

## Reserva para sólidos (no se construye ahora)

- `job_type=spreading` permanece en el enum.
- Las unidades `kg/ha` y `g/ha` permanecen en `FieldJobProduct.Unit`.
- El manejo de granulados (volumen aparte) ya está en `calculate_mix`.
- El módulo de sólidos será **agregar pantallas/UI**, no rehacer el modelo.

## Tipo de cultivo — detalle de UI

- Selector con 4 opciones: Arroz, Maíz, Pasto, Otros.
- Al elegir **Otros**, aparece un campo de texto (`crop_other`) para escribir el cultivo.
- El detalle muestra `crop_other` si el cultivo es "otros", si no el label de la opción.

## Testing

- Backend: pytest — creación con químicos anidados, límite de 10 (>10 → 400), recálculo de total
  (ha × precio), `calculate_mix` (incluido el ejemplo 15 ha × 20 L/ha × tanque 200, glifosato
  10 L/ha → tanque1 100L químico + 100L agua; tanque2 50+50), acciones mark-done/cancel/
  generate-invoice, cultivo "otros" con texto.
- Web: vitest — render del formulario (selector de cultivo, "otros" revela texto, agregar
  químico, tope de 10), `SprayMixModal` (desglose), card de químicos en el detalle.
- Móvil: `npm run typecheck` (gate; sin framework de tests).

## Constraints globales

- Trabajo en rama `V2.0`; **no** mergear a master sin pedido explícito.
- Unidades de químico en fumigación: **L/ha y cc/ha** únicamente (UI). El modelo conserva las 4.
- Tanque default **200 L** (modificable); hectáreas default **1** (modificable).
- Tras agregar migraciones, correr `python manage.py migrate` en el contenedor antes de probar
  en vivo (el runserver no migra solo en este entorno).
- Commits en español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
