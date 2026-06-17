# Módulo de Trabajos de Campo — Integración nuWay AgTrack

**Fecha:** 2026-06-16
**Estado:** Aprobado por el usuario; listo para plan de implementación.
**Reemplaza:** `2026-06-07-modulo-trabajos-campo-design.md` (spec original, sin implementar).
**Alcance:** Backend · Frontend web · App móvil Android (Expo) — todo en paralelo.

---

## 1. Contexto y problema

El ERP Veragro cubre el **mantenimiento/reparación** de drones (órdenes de servicio),
pero no el **trabajo de campo** que es el negocio principal: fumigar y esparcir con drones.

El spec original del 2026-06-07 fue aprobado pero quedó sin implementar. Esta versión
**amplía** ese diseño incorporando las funcionalidades clave de **nuWay AgTrack**
(app iOS para operadores de drones agrícolas en EE.UU.) adaptadas a Panamá:

| Función nuWay AgTrack | Equivalente en este spec |
|---|---|
| Spray Mix Calculator | Calculadora de mezclas (endpoint + UI) |
| Pesticide Reporting (tasa, clima, equipo) | Campos `application_rate`, clima, GPS |
| Job Planning | Flujo programado → hecho → facturado |
| FAA Reporting | Exportación de registro (MIDA Panamá — follow-up) |

### Tarifas del negocio

- **Fumigación:** $20–25 por **hectárea** (base configurable $20/ha).
- **Esparcido / abono al voleo:** $10–15 por **quintal** (base configurable $10/qq).

---

## 2. Modelo `FieldJob`

Nuevo app `backend/apps/field_jobs/`. Hereda `TimeStampedModel`.

### 2.1 Campos base (del spec original)

| Campo | Tipo | Notas |
|---|---|---|
| `number` | `CharField(30, unique, blank)` | Autogenerado `TC-NNNNNN` en `save()` |
| `job_type` | choices | `fumigation` / `spreading` |
| `status` | choices | `scheduled → done → invoiced`, `cancelled` |
| `customer` | FK `customers.Customer` PROTECT | |
| `equipment` | FK `equipment.Equipment` PROTECT, null/blank | El dron usado |
| `technician` | FK `users.User` SET_NULL, null/blank | Operador |
| `scheduled_date` | `DateField(default=localdate)` | Fecha programada |
| `done_date` | `DateField(null, blank)` | Se setea al marcar hecho |
| `location` | `CharField(255, blank)` | Finca / lote / descripción |
| `crop` | `CharField(100, blank)` | Cultivo (texto libre) |
| `applied_product` | `CharField(255, blank)` | Producto principal (texto libre) |
| `hectares` | `Decimal(10,4, default=0)` | Base de cobro en fumigación |
| `quintals` | `Decimal(10,4, default=0)` | Base de cobro en esparcido |
| `unit_price` | `Decimal(12,2, default=0)` | $/ha o $/qq; ajustable por trabajo |
| `total` | `Decimal(14,2, default=0)` | Read-only; recalculado en servidor |
| `notes` | `TextField(blank)` | Notas generales |
| `created_by` | FK `users.User` SET_NULL, null/blank | |

### 2.2 Campos nuevos — Registro de aplicación (inspirado en nuWay)

Todos opcionales (`null=True, blank=True`) para no romper el flujo mínimo.

| Campo | Tipo | Notas |
|---|---|---|
| `application_rate` | `Decimal(10,4, null, blank)` | Dosis del producto (p.ej. 1.5) |
| `application_rate_unit` | `CharField(10, blank)` choices | `"L/ha"`, `"mL/ha"`, `"kg/ha"`, `"cc/ha"` |
| `tank_volume_liters` | `Decimal(10,2, null, blank)` | Capacidad del tanque del dron (litros) |
| `water_per_hectare` | `Decimal(10,2, null, blank)` | Litros de agua de carga por hectárea |
| `latitude` | `Decimal(9,6, null, blank)` | Coordenada GPS del lote |
| `longitude` | `Decimal(9,6, null, blank)` | Coordenada GPS del lote |
| `wind_speed_kmh` | `Decimal(5,1, null, blank)` | Velocidad del viento al aplicar |
| `temperature_celsius` | `Decimal(5,1, null, blank)` | Temperatura al aplicar |
| `humidity_percentage` | `Decimal(5,1, null, blank)` | Humedad relativa (%) |
| `weather_notes` | `CharField(100, blank)` | Texto libre: "soleado", "parcialmente nublado" |

### 2.3 Choices completas

```python
class JobType(models.TextChoices):
    FUMIGATION = "fumigation", "Fumigación"
    SPREADING  = "spreading",  "Esparcido / abono"

class Status(models.TextChoices):
    SCHEDULED = "scheduled", "Programado"
    DONE      = "done",      "Hecho"
    INVOICED  = "invoiced",  "Facturado"
    CANCELLED = "cancelled", "Cancelado"

class RateUnit(models.TextChoices):
    L_HA  = "L/ha",  "L/ha"
    ML_HA = "mL/ha", "mL/ha"
    KG_HA = "kg/ha", "kg/ha"
    CC_HA = "cc/ha", "cc/ha"
```

### 2.4 Reglas de cálculo y numeración

```python
def save(self, *args, **kwargs):
    super().save(*args, **kwargs)
    if not self.number:
        self.number = f"TC-{self.pk:06d}"
        super().save(update_fields=["number"])

def recalculate_total(self):
    if self.job_type == self.JobType.FUMIGATION:
        self.total = (self.hectares or 0) * (self.unit_price or 0)
    else:
        self.total = (self.quintals or 0) * (self.unit_price or 0)

class Meta:
    ordering = ("-scheduled_date", "-created_at")  # más próximos primero
```

---

## 3. Calculadora de Mezclas (SprayMix)

No persiste datos — es un endpoint de cálculo puro. El técnico lo usa antes o
durante el trabajo para saber cuánto producto cargar en cada tanque.

### 3.1 Lógica de cálculo

```
volumen_total   = hectares × water_per_hectare       # litros de carga total
fills_needed    = ceil(volumen_total / tank_volume)
per_fill_liters = tank_volume                         # litros de agua por llenado

Para cada producto:
  qty_total = per_fill_liters × dose_per_liter        # cantidad por tanque
```

Ejemplo: 12 ha, 8 L/ha carga, tanque 30 L, 2 productos (Glifosato 8 mL/L, Coadyuvante 3 mL/L):
- volumen_total = 96 L → fills = ceil(96/30) = 4 llenados (3 completos + 1 parcial de 6 L)
- por llenado: 240 mL Glifosato, 90 mL Coadyuvante (en 30 L)
- último llenado parcial (6 L): 48 mL Glifosato, 18 mL Coadyuvante

### 3.2 Endpoint

```
POST /api/field-jobs/calculate-mix/
{
  "hectares": 12.0,
  "water_per_hectare": 8.0,
  "tank_volume_liters": 30.0,
  "products": [
    { "name": "Glifosato 48%", "dose_per_liter": 8.0, "dose_unit": "mL/L" },
    { "name": "Coadyuvante",   "dose_per_liter": 3.0, "dose_unit": "mL/L" }
  ]
}

→ 200 OK:
{
  "total_volume_liters": 96.0,
  "fills_needed": 4,
  "full_fills": 3,
  "last_fill_liters": 6.0,
  "per_full_fill": [
    { "name": "Glifosato 48%", "quantity": 240.0, "unit": "mL" },
    { "name": "Coadyuvante",   "quantity": 90.0,  "unit": "mL" }
  ],
  "last_fill": [
    { "name": "Glifosato 48%", "quantity": 48.0,  "unit": "mL" },
    { "name": "Coadyuvante",   "quantity": 18.0,  "unit": "mL" }
  ]
}
```

Validaciones: `hectares > 0`, `tank_volume_liters > 0`, `water_per_hectare > 0`,
`products` no vacío, cada `dose_per_liter > 0`. Errores → 400 con detalle de campo.
No requiere autenticación especial (es solo cálculo matemático).

---

## 4. Backend completo

### 4.1 `apps/field_jobs/services.py`

```python
# recalculate_total(job) → aplica la regla de cálculo y guarda total
# mark_done(job) → scheduled → done, done_date = hoy. Error si no scheduled.
# cancel_job(job) → → cancelled. Error si invoiced.
```

Siguiendo el patrón atómico de `service_orders/services.py`.

### 4.2 `apps/field_jobs/views.py`

`FieldJobViewSet(ModelViewSet)` con permiso `RoleWriteOrReadOnly("admin", "technician")`.

- `perform_create` / `perform_update`: `recalculate_total`, asigna `created_by`.
- Filtros: `?customer=`, `?equipment=`, `?technician=`, `?status=`, `?job_type=`,
  `?from=YYYY-MM-DD&to=YYYY-MM-DD` (sobre `scheduled_date`; fecha inválida → 400).
- Búsqueda `?search=`: `number`, `location`, `crop`, `customer__name`, `applied_product`.
- Paginación estándar (`{count, results}`).

**Acciones `@action(detail=True, methods=["post"])`:**
- `mark-done` → `mark_done(job)`, devuelve el job actualizado.
- `generate-invoice` → `create_invoice_from_field_job(job, user)`, devuelve la factura.
- `cancel` → `cancel_job(job)`, devuelve el job.

**Acción `@action(detail=False, methods=["post"])`:**
- `calculate-mix` → lógica de la calculadora (sección 3), sin autenticación de rol.

### 4.3 `apps/field_jobs/serializers.py`

`total`, `done_date` y `number`: **read-only**.
Campos extra read-only: `customer_name`, `equipment_name`, `technician_name`,
`job_type_display`, `status_display`, `application_rate_unit_display`.

### 4.4 Cambios en `apps/billing`

**`models.py`:**
```python
class InvoiceType(models.TextChoices):
    SERVICE      = "service_invoice", "Factura de servicio"
    FINAL        = "final_invoice",   "Factura final"
    PRODUCT_SALE = "product_sale",    "Venta de producto"
    FIELD_JOB    = "field_job",       "Factura de fumigación"   # NUEVO

# FK nueva en Invoice:
field_job = models.ForeignKey(
    "field_jobs.FieldJob",
    on_delete=models.SET_NULL,
    null=True, blank=True,
    related_name="invoices",
)

# En Invoice.save(), extender el prefijo:
if self.invoice_type == self.InvoiceType.FIELD_JOB:
    prefix = "FUM"
elif self.invoice_type == self.InvoiceType.SERVICE:
    prefix = "OS"
else:
    prefix = "FAC"
```

**`services.py` — nuevo `create_invoice_from_field_job(*, job, user=None)`:**
- Exige `job.status == DONE`.
- Rechaza doble facturación activa (`job.invoices.exclude(status=CANCELLED).exists()`).
- Crea `Invoice(invoice_type=FIELD_JOB, customer=job.customer, field_job=job)`.
- Crea una `InvoiceLine` con:
  - `quantity` = `hectares` (fumigación) o `quintals` (esparcido)
  - `unit_price` = `job.unit_price`
  - `description` construida dinámicamente:
    - Fumigación: `"Fumigación 12.50 ha @ $20.00/ha — Finca La Esperanza"`
    - Esparcido: `"Esparcido 8.00 qq @ $10.00/qq — Finca Los Naranjos"`
  - `line_type = LineType.SERVICE`
- Llama `recalculate_invoice(invoice)` → setea `job.status = invoiced`.

### 4.5 Cambios en `apps/core` — `CompanyProfile`

Cuatro campos nuevos (todos Decimal):
```python
fumigation_price_per_hectare = models.DecimalField(max_digits=10, decimal_places=2, default=20)
spreading_price_per_quintal  = models.DecimalField(max_digits=10, decimal_places=2, default=10)
drone_tank_volume_liters     = models.DecimalField(max_digits=8,  decimal_places=2, default=30)
default_water_per_hectare    = models.DecimalField(max_digits=8,  decimal_places=2, default=8)
```

Los dos últimos prelllenan la calculadora en la UI; los dos primeros prerellenan `unit_price`
en el formulario de trabajo (comportamiento idéntico al spec original).

### 4.6 Migraciones

1. `field_jobs/0001_initial.py` — modelo `FieldJob` completo.
2. `billing/000X_field_job_type_and_fk.py` — nuevo choice + FK `field_job`.
3. `core/000X_company_price_defaults.py` — cuatro campos en `CompanyProfile`.

### 4.7 Tests (pytest)

**`field_jobs/tests/test_models.py`:**
- Autogeneración de `number` (`TC-000001`).
- `recalculate_total`: fumigación usa `hectares`, esparcido usa `quintals`;
  el campo opuesto no afecta el total.
- Ordering: el trabajo con `scheduled_date` más reciente aparece primero.

**`field_jobs/tests/test_services.py`:**
- `mark_done`: éxito desde `scheduled`; error desde `done` o `invoiced`.
- `cancel_job`: éxito desde `scheduled`/`done`; error desde `invoiced`.
- `create_invoice_from_field_job`: exige `done`; rechaza doble factura; la línea tiene
  cantidad, precio y descripción correctos; el número empieza con `FUM-`; el job queda `invoiced`.

**`field_jobs/tests/test_api.py`:**
- CRUD completo.
- Filtros: `?job_type=fumigation`, `?status=scheduled`, `?from=&to=` (400 en fecha inválida).
- Búsqueda por `location` y `customer__name`.
- Acciones: `mark-done`, `generate-invoice`, `cancel`.
- `calculate-mix`: resultado correcto, validaciones (400 en campos faltantes).
- Permisos: technician escribe, viewer/anon solo lee.

---

## 5. Frontend web — `frontend/src/features/field-jobs/`

Patrón exacto de `features/service-orders/`.

### 5.1 Archivos

```
field-jobs/
  types.ts
  api.ts
  FieldJobsPage.tsx
  FieldJobFormModal.tsx
  FieldJobDetailPage.tsx
  SprayMixModal.tsx
```

### 5.2 `types.ts`

```ts
export interface FieldJob {
  id: number;
  number: string;
  job_type: "fumigation" | "spreading";
  job_type_display: string;
  status: "scheduled" | "done" | "invoiced" | "cancelled";
  status_display: string;
  customer: number;
  customer_name: string;
  equipment: number | null;
  equipment_name: string;
  technician: number | null;
  technician_name: string;
  scheduled_date: string;
  done_date: string | null;
  location: string;
  crop: string;
  applied_product: string;
  hectares: string;
  quintals: string;
  unit_price: string;
  total: string;
  notes: string;
  // Campos nuWay:
  application_rate: string | null;
  application_rate_unit: string | null;
  tank_volume_liters: string | null;
  water_per_hectare: string | null;
  latitude: string | null;
  longitude: string | null;
  wind_speed_kmh: string | null;
  temperature_celsius: string | null;
  humidity_percentage: string | null;
  weather_notes: string;
  created_at: string;
}

export interface SprayMixProduct {
  name: string;
  dose_per_liter: number;
  dose_unit: "mL/L" | "cc/L";
}

export interface SprayMixResult {
  total_volume_liters: number;
  fills_needed: number;
  full_fills: number;
  last_fill_liters: number;
  per_full_fill: { name: string; quantity: number; unit: string }[];
  last_fill: { name: string; quantity: number; unit: string }[];
}
```

### 5.3 `api.ts`

```ts
// Hooks: useFieldJobs(params), useFieldJob(id),
//        useCreateFieldJob, useUpdateFieldJob, useDeleteFieldJob,
//        useFieldJobAction(id)   // mark-done | generate-invoice | cancel
//        useCalculateMix        // mutación sin invalidación de caché
// Patrón idéntico a features/service-orders/api.ts
```

### 5.4 `FieldJobsPage.tsx`

`DataTable` con columnas:
- Número · Tipo (badge) · Cliente · Finca · Programado · Ha/Qq · Total · Estado (badge)

Toolbar: búsqueda texto + select Tipo + select Estado + DateRangePicker.
Paginación al pie. Fila clicable → `FieldJobDetailPage`. Botón "Nuevo trabajo".

### 5.5 `FieldJobFormModal.tsx`

**Sección 1 — Tipo y estado (siempre visible)**
- `SegmentedControl`: Fumigación / Esparcido. Cambia la UI de la sección 3.
- Select Cliente (required). Select Dron (filtrado a equipo tipo *dron*). Select Técnico.
- `DateInput` Fecha programada (default hoy).

**Sección 2 — Lugar y cultivo**
- TextInput Finca / Ubicación. TextInput Cultivo. TextInput Producto aplicado.

**Sección 3 — Cantidad y precio (varía según tipo)**
- Fumigación: `NumberInput` Hectáreas (required).
- Esparcido: `NumberInput` Quintales (required). `NumberInput` Hectáreas (opcional, informativo).
- `NumberInput` Precio/ha o $/qq — prellenado desde `useCompanyProfile`.
- **Total en vivo**: `= hectares × unit_price` o `= quintals × unit_price`.

**Sección 4 — Detalles de aplicación** *(colapsable, opcional)*
- `NumberInput` Tasa de aplicación + Select Unidad (`L/ha`, `mL/ha`, `kg/ha`, `cc/ha`).
- `NumberInput` Capacidad del tanque (L) — prellenado desde `CompanyProfile.drone_tank_volume_liters`.
- `NumberInput` Agua por hectárea (L/ha) — prellenado desde `CompanyProfile.default_water_per_hectare`.
- Botón **"Calcular mezcla"** → abre `SprayMixModal` con los valores ya rellenos.

**Sección 5 — Condiciones climáticas** *(colapsable, opcional)*
- `NumberInput` Velocidad del viento (km/h). `NumberInput` Temperatura (°C).
  `NumberInput` Humedad (%). TextInput Condiciones generales.

**Sección 6 — Coordenadas GPS** *(colapsable, opcional)*
- `NumberInput` Latitud. `NumberInput` Longitud.
- Nota: en móvil, el botón "Mi ubicación" llena estos campos automáticamente.

**Sección 7 — Notas** *(siempre visible)*
- `Textarea` Notas generales.

### 5.6 `FieldJobDetailPage.tsx`

`DetailHeader`: número + badge de estado.

Cards `Field`:
- Información básica: cliente, dron, técnico, tipo, finca, cultivo, producto.
- Fechas: programado, hecho (si existe).
- Cantidades y precio: ha/qq, $/unidad, **Total** (destacado).
- Aplicación *(solo si hay datos)*: tasa, tanque, agua/ha.
- Clima *(solo si hay datos)*: viento, temp, humedad, condiciones.
- Coordenadas *(solo si hay datos)*: lat/lon con link a Google Maps.
- Notas *(solo si hay datos)*.

Botones según estado:
- `scheduled` → **Marcar hecho** (`mark-done`) + **Cancelar**.
- `done` → **Facturar** (`generate-invoice`) + **Cancelar**.
- `invoiced` → enlace **"Ver factura FUM-NNNNNN"** (read-only).

### 5.7 `SprayMixModal.tsx`

Modal standalone que llama a `POST /api/field-jobs/calculate-mix/`.

Inputs: hectáreas, agua/ha, litros de tanque.
Lista dinámica de productos: nombre, dosis/litro, unidad. Botón "+ Agregar producto".

Resultado: tabla con columnas "Producto · Cantidad por tanque · Cantidad último tanque".
Total de llenados destacado. Botón "Copiar resultado" (para pegar en notas).

### 5.8 Sidebar y rutas

```ts
// navItems.ts — nuevo grupo o en grupo principal:
{ label: "Trabajos de campo", to: "/field-jobs", icon: "IconSpray" }

// AppRoutes.tsx:
<Route path="/field-jobs" element={<FieldJobsPage />} />
<Route path="/field-jobs/:id" element={<FieldJobDetailPage />} />
```

### 5.9 Configuración (web)

En `SettingsPage`, pestaña **Empresa** (`CompanySettings.tsx`), añadir bloque:

**"Trabajos de campo"**
- Precio base fumigación ($/ha)
- Precio base esparcido ($/qq)
- Capacidad del tanque del dron (litros)
- Agua de carga por hectárea (L/ha)

### 5.10 Tests Vitest

- `FieldJobsPage`: renderiza lista, filtra por tipo y estado.
- `FieldJobFormModal`: segmented cambia el campo quantity; sección 4 muestra cuando
  se expande; precio prellenado según tipo.
- `FieldJobDetailPage`: botones correctos según status.
- `SprayMixModal`: resultado de cálculo se muestra correctamente.

---

## 6. App móvil — `mobile/src/features/field-jobs/`

### 6.1 Nueva pestaña "Campo" en el tab bar

La fumigación es el negocio principal. Se añade la pestaña **Campo** como la segunda
del bottom tab bar, entre Inicio y Órdenes.

```
Inicio · Campo · Inventario · Órdenes · Más
  🏠       🌿       📦          🔧       ⋮
```

Icono: `Ionicons "leaf"` (Expo lo tiene). El tab se llama **Campo**.

**`navigation/types.ts` — nuevo stack:**
```ts
export type FieldJobsStackParamList = {
  FieldJobsList: undefined;
  FieldJobDetail: { id: number; title: string };
  SprayCalculator: { prefill?: SprayCalcPrefill };
};
export type FieldJobsNav = NativeStackNavigationProp<FieldJobsStackParamList>;
```

`RootTabParamList` añade `FieldJobsTab: undefined` como segunda entrada.

**`MainTabs.tsx`** — añadir `FieldJobsNavigator` entre `DashboardNavigator` y `InventoryNavigator`.

### 6.2 `features/field-jobs/` — archivos

```
field-jobs/
  api.ts
  FieldJobsScreen.tsx
  FieldJobDetailScreen.tsx
  FieldJobFormModal.tsx
  SprayCalculatorScreen.tsx
```

### 6.3 `FieldJobsScreen.tsx`

Lista de trabajos propios del técnico (ordenados por `scheduled_date` desc).

- Cards con: número · badge estado · cliente · finca · fecha · ha/qq · total.
- FAB `+` → abre `FieldJobFormModal`.
- Pull-to-refresh.
- Tap → `FieldJobDetail`.
- Buscador opcional en header (SearchBar de RN).

### 6.4 `FieldJobDetailScreen.tsx`

Espeja el patrón de `OrderDetailScreen.tsx`.

**Encabezado:** `TC-NNNNNN` + badge de estado.

**Card "Trabajo":**
- Cliente, Dron, Técnico, Tipo, Finca, Cultivo, Producto.

**Card "Cantidades":**
- Hectáreas (o Quintales), Precio/unidad, **Total** en grande.

**Card "Aplicación"** *(solo si hay datos)*:
- Tasa, tanque, agua/ha.
- Botón **"Calculadora de mezcla →"** — navega a `SprayCalculatorScreen` con los valores
  del trabajo ya cargados como `prefill`.

**Card "Clima"** *(solo si hay datos)*:
- Viento km/h, Temp °C, Humedad %, Condiciones.

**Card "Coordenadas"** *(solo si hay datos)*:
- Lat/Lon como texto. Botón **"Abrir en Maps"** → `Linking.openURL` con Google Maps.

**Card "Notas"** *(solo si hay datos)*:
- Texto de notas.

**Botones de acción:**
```
scheduled → [Marcar hecho]  [Cancelar]
done      → [Facturar]      [Cancelar]
invoiced  → "Facturado · FUM-NNNNNN"
cancelled → (ningún botón)
```

Confirmaciones con `Alert` antes de cada acción (igual que en `OrderDetailScreen`).
Al facturar: `Alert.alert("Listo", "Factura FUM-NNNNNN generada.")`.

### 6.5 `FieldJobFormModal.tsx` (móvil)

`Modal` (fullscreen en Android) con `ScrollView`.

**Sección 1 — Tipo** (Tabs o Segmented): Fumigación / Esparcido.

**Sección 2 — Básicos:**
- Select Cliente · Select Dron · Select Técnico.
- DatePicker Fecha programada.

**Sección 3 — Lugar:**
- TextInput Finca/Ubicación.
- TextInput Cultivo. TextInput Producto aplicado.

**Sección 4 — Cantidad:**
- `NumberInput` Hectáreas (fumigación) o Quintales (esparcido).
- `NumberInput` Precio/unidad (prellenado desde settings).
- Texto en vivo: `Total estimado: $XXX.XX`.

**Sección 5 — Detalles de aplicación** *(expandible con chevron)*:
- TextInput Tasa (+ Picker unidad L/ha / mL/ha / kg/ha / cc/ha).
- TextInput Litros de tanque.
- TextInput Agua/ha.

**Sección 6 — Condiciones climáticas** *(expandible con chevron)*:
- TextInput Viento (km/h) · Temperatura (°C) · Humedad (%).
- TextInput Condiciones (texto libre).

**Sección 7 — Coordenadas GPS**:
- Dos TextInput (lat, lon) readonly.
- Botón **"📍 Usar mi ubicación"** → `expo-location`:
  ```ts
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status === "granted") {
    const loc = await Location.getCurrentPositionAsync({});
    setValues({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
  }
  ```
- Textos pequeños con coordenadas confirmadas o mensaje de error.

**Sección 8 — Notas** *(siempre visible)*: `TextInput multiline`.

Botón **"Guardar"** al pie.

> Agregar `expo-location` a `package.json` y configurar permisos en `app.json`:
> ```json
> "android": { "permissions": ["ACCESS_FINE_LOCATION"] }
> ```

### 6.6 `SprayCalculatorScreen.tsx`

Pantalla standalone accesible desde:
1. `FieldJobDetailScreen` (con prefill del trabajo actual).
2. Opcionalmente desde el menú principal (como herramienta de cálculo rápido).

```
┌─ Calculadora de mezcla ─────────────────────┐
│ Hectáreas:      [12.0]                      │
│ Agua/ha (L):    [8.0]                       │
│ Tanque (L):     [30.0]                      │
├─ Productos ─────────────────────────────────┤
│ Nombre          Dosis/L    Unidad           │
│ [Glifosato 48%] [8.0]     [mL/L  ▾]  [✕]  │
│ [Coadyuvante  ] [3.0]     [mL/L  ▾]  [✕]  │
│ [+ Agregar producto]                        │
├─ [Calcular]  ───────────────────────────────┤
│                                             │
│  🟢 Total: 96 L en 4 llenados              │
│                                             │
│  Por tanque completo (30 L):               │
│    Glifosato 48%  →  240 mL                │
│    Coadyuvante    →   90 mL                │
│                                             │
│  Último llenado (6 L):                     │
│    Glifosato 48%  →   48 mL                │
│    Coadyuvante    →   18 mL                │
│                                             │
│  [📋 Copiar resultado]                     │
└─────────────────────────────────────────────┘
```

- "Copiar resultado" → `Clipboard.setStringAsync(formattedResult)`.
- Validación inline antes de llamar al API (si algún campo es 0 o vacío, muestra error local).

---

## 7. Integraciones con módulos existentes

### 7.1 Facturas

Los trabajos facturados aparecen en la lista de **Facturas** con prefijo `FUM-` y tipo
*"Factura de fumigación"*. El módulo de facturas no necesita cambios en la UI —
la FK y el tipo nuevo son suficientes para que aparezcan correctamente.

**Móvil:** `InvoicesScreen` y `InvoiceDetailScreen` ya muestran cualquier factura;
no requieren cambios (el tipo `field_job` se mostrará igual que los demás).

### 7.2 Reportes

Los ingresos de fumigación (`invoice_type = field_job`) entran automáticamente en
los reportes de ventas existentes. El tipo propio permite filtrarlos.

Follow-up: tarjeta "Ingresos por fumigación (mes)" en el dashboard.

### 7.3 Equipos

La FK `equipment` filtra a tipo **Drone agrícola** en el select del formulario.
Si ningún equipo tiene ese tipo, el select muestra todos los equipos (fallback seguro).

---

## 8. Orden de implementación sugerido

Dado que backend + web + móvil van en paralelo:

1. **Backend** (todo de una vez; más fácil de testear completo):
   - `field_jobs/` app completa (modelo, services, serializers, views, urls).
   - Migraciones billing y core.
   - Tests en verde.

2. **Frontend web:**
   - `types.ts` + `api.ts`.
   - `FieldJobsPage` + `FieldJobFormModal` (sin secciones expandibles primero).
   - `FieldJobDetailPage` + acciones.
   - `SprayMixModal`.
   - Secciones colapsables (aplicación, clima, GPS).
   - Settings de empresa.

3. **App móvil:**
   - `navigation/types.ts` + `MainTabs.tsx` (nueva pestaña Campo).
   - `FieldJobsScreen` + `FieldJobFormModal` (básico).
   - `FieldJobDetailScreen` + acciones.
   - `SprayCalculatorScreen`.
   - GPS (`expo-location`) en el formulario.
   - Secciones expandibles.

---

## 9. Fuera de alcance (follow-ups)

- **Exportación MIDA Panamá** — reporte regulatorio de aplicaciones de plaguicidas
  (equivalente panameño al reporte FAA de nuWay). Requiere definir el formato exacto
  que acepta el MIDA; candidato para el módulo siguiente.
- **SprayMixLine persisted** — guardar la mezcla calculada junto al trabajo para
  tener historial de qué productos se usaron en cada llenado.
- **Descuento de inventario** — descontar el químico/producto del módulo de inventario.
  Hoy es solo texto libre por decisión explícita.
- **Múltiples operadores por trabajo** — hoy solo un técnico; multi-técnico sería
  una tabla `FieldJobTechnician` similar a cómo las órdenes podrían tener múltiples.
- **Vista de mapa del lote** — visualizar lat/lon en un mapa (MapView en móvil,
  Google Maps embed en web).
- **Programación con calendario** — vista de agenda semanal de trabajos.
- **Notificaciones push** — recordatorio el día del trabajo programado.
