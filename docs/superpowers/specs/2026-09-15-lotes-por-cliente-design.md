# Lotes por cliente (Fase 1 de "calculadora de defensivos")

**Fecha:** 2026-09-15
**Rama:** V3.0
**Estado:** Spec aprobada (diseño validado con el usuario el 2026-09-15)

## Problema

Hoy cada Trabajo de campo se captura desde cero: finca, cultivo, hectáreas, tasa de
aplicación y la lista de químicos se teclean otra vez en cada aplicación, aunque sean los
mismos potreros del mismo cliente mes tras mes. No hay ningún lugar donde vivan los datos
estables de un terreno.

Referencia que trajo el usuario: `https://www.calculadoradefensivos.com.br/talhoes` — cada
*talhão* (lote) guarda su superficie, su cultivo y su receta, y desde ahí se lanza la
aplicación.

## Alcance (fases)

El usuario eligió partir la idea en tres fases. **Esta spec es solo la Fase 1.**

1. **Fase 1 — Lotes por cliente** *(esta spec)*: modelo, API, pestaña en el cliente y
   autollenado del Trabajo de campo.
2. **Fase 2 — Receta compartible:** PDF y WhatsApp de la mezcla. *Fuera de alcance.*
3. **Fase 3 — Delta T:** calculadora de temperatura y humedad con semáforo. *Fuera de alcance.*

También quedan **fuera**: mapa / geometría del lote (la ubicación es texto libre), página
propia de "Lotes" en el menú, e histórico de aplicaciones por lote.

## Decisiones tomadas con el usuario

| Pregunta | Decisión |
|---|---|
| ¿El lote guarda geometría/mapa? | **No.** Solo datos: nombre, ha, cultivo y ubicación en texto. |
| ¿El lote guarda la receta? | **Sí, completa:** tasa L/ha y hasta 10 químicos (nombre, dosis/ha, unidad). |
| ¿Dónde se gestionan? | **Pestaña "Lotes" en el detalle del cliente** + selector en el form del Trabajo de campo. Sin entrada nueva en el menú. |
| ¿Enlace o copia? | **Las dos cosas:** el trabajo guarda un enlace opcional al lote y **copia** sus valores al elegirlo. Editar el lote después no reescribe trabajos ya creados. |
| ¿Dónde vive el código? | **Dentro de `apps.field_jobs`**, al lado de `FieldJob`. No se crea una app nueva. |
| ¿Quién escribe? | Los mismos roles que manejan Trabajos de campo (`roles.FIELD_JOBS_WRITE`). El resto solo lee. |

## Backend (`apps.field_jobs`)

### Modelo `FieldPlot`

| Campo | Tipo | Notas |
|---|---|---|
| `customer` | FK a `customers.Customer`, `PROTECT`, `related_name="plots"` | Obligatorio. Mismo `on_delete` que `FieldJob.customer`. |
| `name` | `CharField(150)` | Obligatorio. Único **entre los lotes activos del mismo cliente**. |
| `hectares` | `Decimal(10,4)`, default `1` | Igual forma que `FieldJob.hectares`. |
| `crop` | `CharField(20)`, choices de `FieldJob.Crop`, default `RICE` | Se reutiliza el enum existente; no se duplica. |
| `crop_other` | `CharField(100)`, blank | Texto libre cuando `crop == "other"`. |
| `location` | `CharField(255)`, blank | Ubicación en texto. |
| `water_per_hectare` | `Decimal(10,2)`, null/blank | Tasa de aplicación L/ha. **Mismo nombre que en `FieldJob`** para que la copia sea campo a campo. |
| `notes` | `TextField`, blank | |
| `is_active` | `BooleanField`, default `True` | Eliminar = desactivar, igual que en Clientes. |

Hereda de `apps.core.models.TimeStampedModel`. Orden por `("customer", "name")`.

La unicidad se declara como `UniqueConstraint(fields=["customer", "name"],
condition=Q(is_active=True))`: dos lotes desactivados pueden repetir nombre, y un nombre
liberado por desactivación se puede volver a usar.

### Modelo `FieldPlotProduct`

`plot` (FK `CASCADE`, `related_name="products"`), `name` (`CharField(150)`),
`dose_per_hectare` (`Decimal(10,4)`, default 0) y `unit` (choices de `FieldJobProduct.Unit`,
default `L/ha`). Orden por `id`. **Máximo 10 por lote**, validado en el serializer igual que
en el trabajo.

### Cambio en `FieldJob`

Campo nuevo `plot`: FK a `FieldPlot`, `null=True, blank=True, on_delete=SET_NULL`,
`related_name="field_jobs"`. Es un enlace informativo: si el lote se borra de verdad, el
trabajo se queda sin enlace pero conserva los datos copiados.

**Una sola migración `field_jobs/0004`**, aditiva: crea las dos tablas y agrega la columna
`plot` (nullable). No toca ni migra datos existentes.

### API `/api/field-plots/`

`ModelViewSet` en `apps/field_jobs/views.py`, registrado en el `SimpleRouter` existente de
`apps/field_jobs/urls.py`.

- **CRUD completo.** `DELETE` no borra: pone `is_active = False` (`perform_destroy`, igual
  que `CustomerViewSet`).
- **Productos anidados**, y al editar **se reemplazan** — la misma semántica que
  `FieldJobSerializer.update`, para que el comportamiento sea uno solo en todo el módulo.
- **Filtros:** `?customer=` (400 si no es numérico, reutilizando el helper `_int_param` de la
  vista de trabajos) y `?include_inactive=true|1|yes|on`. Por defecto solo activos.
- **Búsqueda:** `?search=` sobre `name` y `location`.
- **Sin paginación** (`pagination_class = None`): la lista alimenta un selector, y un cliente
  no va a tener cientos de lotes.
- **Permisos:** `RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)` — escriben super/general admin,
  técnico, ventas y piloto; cualquier autenticado lee.
- **El piloto ve todos los lotes**, no solo los de sus trabajos: son datos del cliente y el
  piloto ya puede escribir clientes (`roles.CUSTOMERS_WRITE` lo incluye). No se replica aquí
  el filtro `technician_id=user.id` de `FieldJobViewSet`.

### `FieldJobSerializer`

Gana `plot` (escribible, opcional, `allow_null`) y `plot_name` (solo lectura, desde
`plot.name`). Dos reglas:

1. El `queryset` del campo `plot` es **solo lotes activos**: no se puede enlazar un trabajo
   nuevo a un lote desactivado.
2. `validate()` comprueba que el lote sea **del mismo cliente** del trabajo, resolviendo
   cliente y lote contra `self.instance` cuando el `PATCH` es parcial. Si no coinciden →
   **400** con `{"plot": "El lote no pertenece al cliente del trabajo."}`.

El backend **no copia nada**: el autollenado es del formulario. El trabajo se guarda con sus
propios valores, ya ajustados por quien lo captura.

## Frontend

### Pestaña "Lotes" en el detalle del cliente

Tercera pestaña de `CustomerDetailPage`, junto a "Órdenes de servicio" y "Facturas".
`DataTable` con nombre, hectáreas, cultivo, ubicación, tasa (L/ha) y número de químicos.
Botones "Nuevo lote", editar y eliminar (con `modals.openConfirmModal`), visibles solo si
`canWriteFieldJobs(user?.role)`.

### `FieldPlotFormModal`

Nombre, hectáreas, cultivo (+ "Especifica el cultivo" cuando es *Otros*), ubicación, tasa de
aplicación y la lista de químicos.

### `ChemicalRowsEditor` (componente compartido)

El editor de filas de químicos que hoy vive incrustado en `FieldJobFormModal` se **extrae a un
componente controlado** (`rows` / `onChange`) y lo usan los dos formularios. Es un refactor sin
cambio visible: mismos textos, mismos placeholders, mismo tope de 10, y los tests actuales de
`FieldJobFormModal` deben seguir pasando sin tocarlos. El texto del tope es una prop, porque
en el trabajo dice "por trabajo" y en el lote dirá "por lote".

### Form del Trabajo de campo

- Selector **"Lote"** debajo de Cliente. Solo se renderiza con un cliente elegido, lista los
  lotes activos de ese cliente y se puede dejar vacío.
- Al elegir un lote se copian **ubicación, cultivo, `crop_other`, hectáreas, tasa y químicos**,
  y aparece el aviso "Datos del lote cargados". Todo queda editable después.
- Cambiar de cliente **limpia** el lote y el aviso.
- Al **editar** un trabajo existente no se sobrescribe nada: el autollenado solo ocurre cuando
  el usuario elige un lote a mano.

### Detalle del trabajo

Una línea más en la ficha: **"Lote"** con `plot_name`, o "—".

## Pruebas

**Backend (pytest):**
- Modelo: nombre único entre activos del mismo cliente; se puede repetir si el otro está
  desactivado; `__str__`.
- API: crear con químicos anidados, tope de 10 → 400, editar reemplaza químicos, `DELETE`
  desactiva y desaparece del listado, `?include_inactive` lo devuelve, `?customer=abc` → 400,
  búsqueda por nombre, la lista es un array (sin envoltura de paginación).
- Permisos: anónimo 401; `readonly` lee pero no escribe (403); `piloto` crea y ve lotes de
  cualquier cliente.
- `FieldJob`: enlazar un lote de otro cliente → 400; enlazar el correcto → 201 con `plot_name`.

**Frontend (Vitest):**
- `FieldPlotFormModal`: campos presentes, agregar químico, tope de 10 con el texto "por lote".
- Pestaña "Lotes": lista los lotes; sin permiso de escritura no muestra los botones.
- `FieldJobFormModal`: sin cliente no hay selector de lote; con cliente sí; al elegirlo se
  copian los valores y sale el aviso.

**Cierre:** regenerar `frontend/src/lib/api/schema.d.ts`, correr `migrate` en el contenedor y
probar en el navegador el ciclo completo: crear un lote, crear un trabajo desde él y calcular
la mezcla.

## Riesgos y notas

- **Windows:** el bind-mount no dispara autoreload; hay que `docker compose restart backend`
  tras editar código Python (ver memoria `backend-autoreload-windows`).
- La migración `0004` es aditiva y reversible; en producción hace falta `migrate` junto con las
  migraciones ya pendientes (`token_blacklist`, `equipment.0005`, `core.0004`).
- `frontend/src/utils/format.ts` (`formatDate`) tiene el desfase conocido de un día en zonas
  con offset negativo. La pestaña de lotes no muestra fechas, así que no lo toca.
