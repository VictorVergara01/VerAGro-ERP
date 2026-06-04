# Spec — Frontend: Feature Clientes Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 11 — Frontend feature Clientes (`frontend/src/features/customers/`)

## 1. Contexto y alcance
Primer feature CRUD del panel web, sobre la Fundación frontend. **Marca el patrón reutilizable**
(hooks tipados con TanStack Query + tabla Mantine filtrable + modal de formulario con `@mantine/form`
+ confirmación de borrado + página de detalle con historial) que replicarán Equipos, Inventario, etc.

### Dentro del alcance
- Lista `/customers`: tabla con búsqueda (`?search=`), toggle "incluir inactivos", paginación
  (`?page=`, PageNumber size 25), botón "Nuevo cliente", acciones por fila (editar, ver, eliminar).
- Crear/Editar: modal con form (`@mantine/form`) con todos los campos del modelo Customer.
- Detalle `/customers/:id`: datos del cliente + pestañas de historial (Órdenes de servicio, Facturas)
  consumiendo `/customers/{id}/service-orders/` e `/invoices/` (ya conectados, paginados).
- Soft-delete (DELETE → `is_active=False`) con confirmación.
- Notificaciones (`@mantine/notifications`) en éxito/error de mutaciones.
- Habilitar "Clientes" en el Sidebar; rutas en `AppRoutes`.
- Tests (Vitest): la lista renderiza filas de datos mockeados; validación del form.

### Fuera del alcance
- Validación avanzada (DV vs RUC), exportar, columnas configurables → follow-up.
- Permisos por rol en UI (el backend hoy deja a cualquier autenticado; follow-up #1 backend).

## 2. Patrón reutilizable (a extraer/seguir)
- `components/ui/PageHeader.tsx`: título + acciones (botón primario).
- `components/ui/DataTable.tsx` (genérico ligero): props `columns`, `rows`, `loading`, `emptyText`.
  Render con `Table` de Mantine; sin estado propio (la página controla datos/paginación).
- `lib/api/types.ts`: helper `Paginated<T> = { count; next; previous; results: T[] }` y
  `components<"schemas">` para extraer tipos del schema generado.
- Hooks por feature: `useCustomers(params)`, `useCustomer(id)`, `useCreate/Update/DeleteCustomer`
  (TanStack Query; invalidan `['customers']`). Tipos de fila desde el schema OpenAPI.

## 3. Estructura (`features/customers/`)
- `types.ts`: `Customer = components["schemas"]["Customer"]`; opciones de selects.
- `api.ts`: hooks de query/mutación (usa `api` de `lib/api/client`).
- `CustomersPage.tsx`: lista + toolbar (search, switch inactivos, nuevo) + tabla + paginación.
- `CustomerFormModal.tsx`: form crear/editar (abre vía `modals.open` o estado local).
- `CustomerDetailPage.tsx`: datos + `Tabs` (Servicio, Facturas) con sus hooks de historial.
- `customers.test.tsx`: render de la lista con hook mockeado.

## 4. API (backend ya disponible)
- `GET /api/customers/?search=&include_inactive=&page=` → `Paginated<Customer>`.
- `POST /api/customers/`, `PATCH /api/customers/{id}/`, `DELETE /api/customers/{id}/` (soft).
- `GET /api/customers/{id}/` ; `GET /api/customers/{id}/service-orders/` ; `/invoices/`
  (paginados, summary).

## 5. Form (campos Customer)
`customer_type` (select person/company), `name` (requerido), `legal_name`, `identification_type`
(select cedula/ruc/passport/other), `identification_number`, `dv`, `phone`, `whatsapp`, `email`
(validación formato), `address`, `province`, `district`, `notes`. Validación mínima: `name` no vacío;
`email` formato si se ingresa.

## 6. UX
- Tabla: nombre, tipo, identificación, teléfono, email, estado (Badge activo/inactivo), acciones.
- Búsqueda con debounce; el switch "inactivos" refetchea. Paginación inferior.
- Modal de borrado (`modals.openConfirmModal`) → DELETE → notificación + invalidar lista.
- Loading: filas skeleton o `loading` del DataTable; error: alerta.

## 7. Verificación
- `npm run typecheck`, `npm run build`, `npm run test` en verde.
- En vivo: listar, buscar, crear, editar, ver detalle con historial, eliminar (pasa a inactivo),
  togglear inactivos.

## 8. Criterio de aceptación
- CRUD de clientes funcional desde la UI contra el backend; búsqueda, inactivos, paginación.
- Detalle con historial de servicio y facturas.
- Patrón (DataTable/PageHeader/hooks) listo para reusar en los siguientes features.
- Sidebar habilita Clientes; tests/build en verde.
