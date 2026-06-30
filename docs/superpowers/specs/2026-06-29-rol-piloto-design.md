# Diseño — Nuevo rol de usuario "Piloto"

Fecha: 2026-06-29 · Rama: `V3.0`

## Objetivo

Agregar un 8º rol `piloto` al ERP, enfocado en la operación de campo
(fumigación con drones), separado del rol `technician` (taller / órdenes de
servicio). El piloto registra y ejecuta sus trabajos de campo y registra
clientes; no participa en facturación, inventario ni órdenes de servicio.

## Decisiones tomadas (con el usuario)

1. **Rol nuevo separado**, no reemplaza ni es variante de `technician`. Quedan
   8 roles.
2. **Permisos de escritura del piloto:** Trabajos de campo y Clientes. Equipos
   en solo-lectura (para seleccionar el dron). No factura.
3. **Visibilidad:** un piloto ve/edita **solo sus propios** trabajos de campo
   (restricción dura en backend, no solo filtro de UI).
4. **Plataformas:** web y móvil.
5. **Selector "Piloto"** del formulario de trabajo lista **solo** usuarios con
   rol `piloto`.
6. El campo `FieldJob.technician` **no se renombra** (ya está etiquetado
   "Piloto" en la UI); renombrarlo no aporta valor y arrastra migración +
   notificaciones + serializer + front.

## Alcance backend

### Modelo de usuario
- `apps/users/models.py` → `User.Role`: agregar
  `PILOTO = "piloto", "Piloto"`.
- Migración de esquema en `apps/users/` (solo `AlterField` del enum `role`;
  `"piloto"` cabe en `max_length=20`). **Sin data migration** (no hay registros
  que convertir; los trabajos ya asignados a técnicos no cambian).
- `apps/users/admin.py` / `forms.py`: ya derivan los choices del enum `Role`, así
  que el alta/edición de usuarios mostrará "Piloto" sin cambios. (Verificar.)

### Matriz de roles (`apps/core/roles.py`)
- Agregar código `PILOTO = "piloto"`.
- Nuevo grupo nombrado `FIELD_JOBS_WRITE = (*ADMINS, TECHNICIAN, SALES, PILOTO)`.
- `CUSTOMERS_WRITE` += `PILOTO` →
  `(*ADMINS, SALES, TECHNICIAN, INVENTORY, PILOTO)`.
- **No** se agrega `PILOTO` a `EQUIPMENT_WRITE` (queda solo-lectura, que ya es
  el default de lectura para autenticados).

### Viewset de trabajos de campo (`apps/field_jobs/views.py`)
- `FieldJobWrite` usa `RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)`.
- `get_queryset`: si `self.request.user.role == roles.PILOTO`, forzar
  `qs.filter(technician_id=self.request.user.id)` **además** de los filtros de
  query existentes. Efecto: list/retrieve/update/destroy de un trabajo ajeno
  devuelven 404 para un piloto.
- `perform_create`: si el creador es piloto y el payload no trae `technician`,
  asignarlo a sí mismo (`technician = request.user`) antes de guardar, para que
  no cree un trabajo que luego no podría ver. (La notificación de asignación
  existente sigue funcionando.)
- **`generate-invoice`** (acción del viewset): hoy hereda el permiso de clase
  `FieldJobWrite`; al incluir piloto, un piloto podría facturar. Se le asigna
  `permission_classes=[RoleWriteOrReadOnly(*roles.BILLING_WRITE)]` (admins +
  ventas). Cierra el "no factura". Las demás acciones (`mark-done`, `cancel`,
  `calculate-mix`) quedan accesibles al piloto sobre sus propios trabajos.

## Alcance frontend web

- `features/auth/roles.ts`:
  - `ROLE_LABELS.piloto = "Piloto"`.
  - `isPiloto(r)`; `canWriteFieldJobs(r)` = admins || technician || sales ||
    piloto; `canWriteCustomers` += piloto.
- **Selector "Piloto"** en `FieldJobFormModal`: nuevo hook `usePilots()`
  (`/api/users/?role=piloto`), reemplaza a `useTechnicians` en ese formulario.
- **Navegación** (`Sidebar`): un piloto ve Dashboard, **Trabajos de campo** y
  **Clientes**. Se ocultan inventario, compras, proveedores, órdenes de
  servicio, cotizaciones, facturas, reportes financieros y configuración.
- **Dashboard por rol** (`DashboardPage`): el piloto cae en el panel operativo
  de accesos rápidos (como technician/inventory/readonly), no en el financiero
  (sin 403).
- Regenerar `schema.d.ts` si el enum de rol cambia en el OpenAPI.

## Alcance móvil

- `mobile/src/features/auth/roles.ts`: espejo del web (label + helpers).
- Abrir el menú al piloto: hoy el menú es admin-only. Para el piloto, el menú
  muestra **Trabajos de campo** (incluida la calculadora de mezcla) y
  **Clientes**; "Mis trabajos" filtra por `?technician=me.id` (la restricción
  dura del backend lo refuerza). El resto del menú permanece para admins.
- Regenerar `mobile/src/lib/api/schema.d.ts` (RoleEnum con `piloto`).
- Gate del móvil: `npm run typecheck` + `expo export` (no hay framework de
  tests).

## Tests

### Backend
- `piloto` crea/edita trabajo de campo (201) y cliente (201).
- `piloto` recibe 403 al escribir equipos.
- `piloto` recibe 403 en `generate-invoice`.
- `piloto` solo ve sus trabajos: list excluye ajenos; retrieve de ajeno → 404.
- `perform_create` auto-asigna el piloto creador cuando no se especifica.
- `create_superuser` sigue en `super_admin` (sin regresión).

### Web
- Tests de la matriz de helpers de roles (`isPiloto`, `canWriteFieldJobs`,
  `canWriteCustomers`).
- Gateo de navegación: un piloto no ve las secciones ocultas.
- `usePilots` consulta `?role=piloto`.

### Móvil
- `npm run typecheck` en verde.

## Fuera de alcance

- Renombrar el campo `FieldJob.technician`.
- Permitir a otros roles nuevos usar el móvil más allá de lo descrito.
- Gateo de botones por módulo en el móvil más allá de mostrar/ocultar
  Trabajos de campo y Clientes.
- Reportes específicos del piloto.
