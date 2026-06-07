# Roles y Permisos — Diseño

**Fecha:** 2026-06-07
**Estado:** Aprobado por el usuario; pendiente de plan de implementación.
**Alcance:** Backend (modelo de roles + matriz de permisos) + Frontend web (etiquetas y
visibilidad de botones por rol). **Gestión de usuarios desde la web = fuera de alcance** (sigue
por el panel de Django).

## Contexto y problema

El ERP define hoy 5 roles en `User.Role` (`admin`, `technician`, `sales`, `inventory`,
`readonly`). El modelo de acceso es **"cualquier autenticado VE casi todo; el rol solo limita la
ESCRITURA"**, implementado con clases de permiso en `apps.core.permissions`
(`RoleWriteOrReadOnly(*roles)`, `role_required(*roles)`, `IsAdmin`, `IsAdminOrReadOnly`).
Esas clases se invocan **dispersas en ~10 viewsets**, sin una fuente única que describa la matriz.

El negocio necesita una estructura de roles más clara, alineada a la organización:

| Rol | Uso |
|---|---|
| Super Administrador | Control total |
| Administrador General | Supervisión diaria |
| Facturación / Ventas | Cotizaciones y facturas |
| Técnico | Mantenimientos |
| Inventario | Stock, entradas y salidas |
| Contabilidad | Pagos y reportes |

## Decisiones tomadas (brainstorming)

1. **Modelo de acceso:** se conserva el actual (todos leen; el rol controla la escritura). No se
   restringe la lectura ni se oculta el sidebar por área.
2. **Super vs Admin General:** el **Super Administrador** es el único que gestiona **usuarios** y la
   **configuración crítica de la empresa**. El **Administrador General** opera **todo el negocio**
   (todos los módulos, incluido borrar/anular), pero **no** toca usuarios ni configuración de empresa.
3. **Contabilidad:** solo **registra pagos** (sobre facturas existentes) y ve **reportes
   financieros**. **No** crea ni edita cotizaciones/facturas.
4. **`readonly` se conserva** como 7º rol "Consulta / Solo lectura" (ve todo, no escribe nada).
5. **Gestión de usuarios desde el ERP web:** diferida. Los usuarios se siguen creando/asignando rol
   desde el panel de Django (`is_superuser`). El Super Administrador es quien tiene ese acceso.
6. **Estructura de implementación:** mapa de roles **centralizado** en `apps/core/roles.py`
   (grupos con nombre) que las clases de permiso existentes consumen. Una sola fuente de verdad.

## Roles finales (7) y migración

| Código | Nombre (UI) | Uso |
|---|---|---|
| `super_admin` | Super Administrador | Control total + usuarios + configuración |
| `general_admin` | Administrador General | Supervisión diaria (opera todo el negocio) |
| `sales` | Facturación / Ventas | Cotizaciones y facturas |
| `technician` | Técnico | Mantenimientos |
| `inventory` | Inventario | Stock, entradas y salidas, compras, proveedores |
| `accounting` | Contabilidad | Pagos y reportes |
| `readonly` | Consulta | Solo lectura |

**Migración** (data migration; nadie pierde acceso):
- `admin → super_admin` (los administradores actuales conservan el control total).
- `technician`, `sales`, `inventory`, `readonly` quedan igual.
- `general_admin` y `accounting` nacen **sin usuarios** (se asignan luego desde el panel de Django).
- `UserManager.create_superuser` pasa a setear `role = "super_admin"` (hoy `"admin"`).

## Matriz de permisos

**Lectura:** cualquier usuario autenticado ve todo (no cambia).
**Escritura (crear/editar/borrar)** — donde `admins` = `super_admin` + `general_admin`:

| Área (módulo) | Pueden ESCRIBIR | Hoy |
|---|---|---|
| Configuración de empresa (`core.CompanyProfile`) | `super_admin` | admin |
| Plantillas de checklist (`checklists` templates) | `admins` | admin |
| Categorías de inventario + Tipos de equipo (lookups) | `admins` + `inventory` | admin, inventory |
| Inventario: productos, ajustes, import/export (`inventory`) | `admins` + `inventory` | admin, inventory |
| Compras: órdenes de compra (`purchasing`) | `admins` + `inventory` | admin, inventory |
| Proveedores (`suppliers`) | `admins` + `inventory` | admin, inventory |
| Equipos (`equipment` EquipmentViewSet) | `admins` + `technician` + `sales` + `inventory` | admin, technician, sales, inventory |
| Clientes (`customers`) | `admins` + `sales` + `technician` + `inventory` | **cualquiera autenticado** |
| Órdenes de servicio + llenar checklist (`service_orders`, `checklists` service) | `admins` + `technician` | admin, technician |
| Cotizaciones y Facturas: crear/editar/emitir/anular (`billing` quotes/invoices) | `admins` + `sales` | admin, sales |
| **Pagos: registrar cobro** (`billing` payments) | `admins` + `accounting` | admin, sales |
| Reportes financieros: dashboard, ventas, ganancia (`reports`) | `admins` + `sales` + `accounting` (lectura) | admin, sales |
| Reportes operativos: bajo stock, servicios, hist. equipo (`reports`) | cualquier autenticado | cualquiera autenticado |

**Cambios de comportamiento (aprobados):**
1. **Pagos salen de Ventas:** `sales` ya **no** registra pagos (solo `accounting` + `admins`).
   Ventas sigue creando/editando/emitiendo/anulando facturas.
2. **Clientes se endurece:** pasa de "cualquiera autenticado" (incluido `readonly`) a
   `admins + sales + technician + inventory` (`readonly` y `accounting` ya no escriben clientes).
3. **Config de empresa:** de "cualquier admin" a **solo `super_admin`**.
4. **Plantillas de checklist:** de "solo admin" a ambos admins.
5. **"Entregar sin cobro"** (override en `service_orders.deliver`): de `admin` a ambos admins.

## Backend — diseño

### `apps/core/roles.py` (nuevo, fuente única de la matriz)

Códigos de rol como constantes y **grupos con nombre** que mapean 1:1 a la matriz:

```python
# Códigos (deben coincidir con User.Role.*)
SUPER_ADMIN = "super_admin"
GENERAL_ADMIN = "general_admin"
SALES = "sales"
TECHNICIAN = "technician"
INVENTORY = "inventory"
ACCOUNTING = "accounting"
READONLY = "readonly"

# Grupos base
SUPER = (SUPER_ADMIN,)
ADMINS = (SUPER_ADMIN, GENERAL_ADMIN)

# Grupos de escritura por área (consumidos por los viewsets)
COMPANY_CONFIG_WRITE = SUPER
CHECKLIST_TEMPLATE_WRITE = ADMINS
LOOKUPS_WRITE = (*ADMINS, INVENTORY)        # categorías, tipos de equipo
INVENTORY_WRITE = (*ADMINS, INVENTORY)      # productos, ajustes, compras, proveedores
EQUIPMENT_WRITE = (*ADMINS, TECHNICIAN, SALES, INVENTORY)
CUSTOMERS_WRITE = (*ADMINS, SALES, TECHNICIAN, INVENTORY)
SERVICE_WRITE = (*ADMINS, TECHNICIAN)
BILLING_WRITE = (*ADMINS, SALES)            # cotizaciones/facturas (crear/editar/emitir/anular)
PAYMENTS_WRITE = (*ADMINS, ACCOUNTING)      # registrar pago
FINANCIAL_READ = (*ADMINS, SALES, ACCOUNTING)  # reportes financieros
```

> Nota: las clases de permiso (`RoleWriteOrReadOnly`, `role_required`) **no cambian**; solo reciben
> estos grupos en vez de literales sueltos. `IsAdmin`/`IsAdminOrReadOnly` (que comparan contra
> `"admin"`) se reemplazan donde se usen por `RoleWriteOrReadOnly(*roles.COMPANY_CONFIG_WRITE)` u
> otro grupo, para no dejar referencias al código `"admin"` ya inexistente.

### `User.Role` (`apps/users/models.py`)

Reemplazar el enum por los 7 valores nuevos:

```python
class Role(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super Administrador"
    GENERAL_ADMIN = "general_admin", "Administrador General"
    SALES = "sales", "Facturación / Ventas"
    TECHNICIAN = "technician", "Técnico"
    INVENTORY = "inventory", "Inventario"
    ACCOUNTING = "accounting", "Contabilidad"
    READONLY = "readonly", "Consulta"
```

`default` se mantiene en `TECHNICIAN`. `create_superuser` setea `role = "super_admin"`.

### Migración de datos (`users`)

Migración con `RunPython` (y reverse): `User.objects.filter(role="admin").update(role="super_admin")`.
La `AlterField` del enum la genera `makemigrations`. La conversión de datos va en la misma migración
o en una siguiente, después de la `AlterField`.

### Aplicación por módulo (reemplazos)

- `core/views.py` `CompanyProfileView`: `IsAdminOrReadOnly` → `RoleWriteOrReadOnly(*roles.COMPANY_CONFIG_WRITE)`.
- `checklists/views.py`: `TemplateWrite` → `RoleWriteOrReadOnly(*roles.CHECKLIST_TEMPLATE_WRITE)`;
  `ChecklistWrite` → `RoleWriteOrReadOnly(*roles.SERVICE_WRITE)`.
- `inventory/views.py`: `InventoryWrite` → `roles.INVENTORY_WRITE`; el viewset de categorías →
  `roles.LOOKUPS_WRITE`.
- `equipment/views.py`: `EquipmentTypeViewSet` → `roles.LOOKUPS_WRITE`; `EquipmentViewSet` →
  `roles.EQUIPMENT_WRITE`.
- `purchasing/views.py`: `PurchasingWrite` → `roles.INVENTORY_WRITE`.
- `suppliers/views.py`: `SuppliersWrite` → `roles.INVENTORY_WRITE`.
- `customers/views.py` `CustomerViewSet`: añadir `permission_classes = [RoleWriteOrReadOnly(*roles.CUSTOMERS_WRITE)]`
  (hoy hereda el default `IsAuthenticated`).
- `service_orders/views.py`: `ServiceWrite` → `roles.SERVICE_WRITE`; el override de `deliver`
  (`getattr(request.user,"role",None) == "admin"`) → `request.user.role in roles.ADMINS`.
- `billing/views.py`: separar permisos por viewset/acción:
  - `QuoteViewSet`, `InvoiceViewSet` (CRUD, `issue`, `cancel`, generación) → `roles.BILLING_WRITE`.
  - **Pagos**: la acción/endpoint que crea pagos (`InvoiceViewSet.payments` POST y/o
    `PaymentViewSet`) → `roles.PAYMENTS_WRITE`. Si hoy `payments` es una `@action` dentro de
    `InvoiceViewSet` con permiso de clase, sobreescribir el permiso de esa acción (override de
    `get_permissions` por `action == "payments"`), de modo que registrar pago exija `PAYMENTS_WRITE`
    aunque el resto del viewset sea `BILLING_WRITE`. (El detalle exacto se resuelve en el plan según
    cómo esté hoy la vista de pagos.)
- `reports/views.py`: `Financial = role_required("admin","sales")` → `role_required(*roles.FINANCIAL_READ)`
  (añade `accounting`). Los operativos siguen `IsAuthenticated`.

> Tras estos cambios **no debe quedar** ninguna referencia al literal `"admin"` en código de permisos
> (buscar `"admin"` y `role ==` para verificar). `IsAdmin`/`IsAdminOrReadOnly` pueden conservarse en
> `permissions.py` si algún test las usa, pero ya no se aplican en viewsets; si quedan sin uso, se
> eliminan junto con sus tests.

### Tests backend

- `apps/core/tests/test_roles.py` (nuevo): los grupos contienen lo esperado (p. ej. `ACCOUNTING in
  PAYMENTS_WRITE` y `ACCOUNTING not in BILLING_WRITE`; `GENERAL_ADMIN in INVENTORY_WRITE` pero
  `GENERAL_ADMIN not in COMPANY_CONFIG_WRITE`; `SUPER_ADMIN` en todos).
- Actualizar `apps/core/tests/test_permissions.py` (usa roles viejos).
- Por módulo, ajustar/añadir tests de permiso al nuevo set. Casos clave de regresión:
  - `accounting` **registra pago** (201) pero **no** crea factura (403).
  - `sales` **crea factura** (201) pero **no** registra pago (403).
  - `general_admin` opera inventario/servicios/billing (201) pero **no** edita CompanyProfile (403).
  - `super_admin` puede todo (incluida CompanyProfile).
  - `readonly` no escribe **clientes** (403, regresión del endurecimiento).
- Test de la data migration (`admin → super_admin`) con `django_test_migrations` o, si no está
  disponible, un test que verifique el estado tras migrar (el plan elige el método según las deps).
- Mantener verde la suite (~269 tests; los que asumen `role="admin"` se actualizan a `super_admin`).

## Frontend web — diseño

El sidebar sigue mostrando todas las secciones (modelo "ver todo"). Cambian etiquetas y la
**visibilidad de botones de acción** (ocultar lo que daría 403), reusando helpers de rol.

### Helpers de rol (`features/auth/roles.ts`, nuevo)

Espejo del mapa del backend, sobre `user.role`:

```ts
export const isSuperAdmin = (r?: string) => r === "super_admin";
export const isAdmin = (r?: string) => r === "super_admin" || r === "general_admin";
export const canWriteBilling = (r?: string) => isAdmin(r) || r === "sales";
export const canRegisterPayments = (r?: string) => isAdmin(r) || r === "accounting";
export const canWriteInventory = (r?: string) => isAdmin(r) || r === "inventory";
export const canWriteService = (r?: string) => isAdmin(r) || r === "technician";
export const FINANCIAL_ROLES = ["super_admin", "general_admin", "sales", "accounting"];
```

### Cambios concretos

- **Regenerar `schema.d.ts`** (`npm run gen:api`) → `RoleEnum` con los 7 valores.
- **`ROLE_LABELS`** (Topbar) con los 7 nombres en español.
- **`DashboardPage`**: `FINANCIAL_ROLES` desde el helper (añade `general_admin`, `accounting`).
- **`CompanySettings`**: `isAdmin` (hoy `role === "admin"`) → `isSuperAdmin` (solo Super edita).
- **`ServiceOrderDetailPage`**: override "Entregar sin cobro" → `isAdmin` (super o general).
- **Facturas (`features/billing`)**:
  - Botón **"Registrar pago"** (`PaymentModal`) visible solo si `canRegisterPayments`.
  - Botones **"Nueva factura/cotización"** y **"Editar"** visibles solo si `canWriteBilling`.
- **Botones de escritura** de Inventario/Compras/Proveedores/Servicios/Clientes/Equipos gateados con
  los helpers correspondientes (ocultos para `readonly` y para roles fuera de su área). El detalle de
  qué botón en qué pantalla se enumera en el plan.

### Tests frontend (Vitest)

- Actualizar `DashboardPage.test` y cualquier test con `role: "admin"` → `super_admin`.
- Pruebas de visibilidad de botones por rol donde aplique (p. ej. "Registrar pago" no aparece para
  `sales`; "Nueva factura" no aparece para `accounting`). Mantener verde la suite.

## Fuera de alcance (follow-ups)

- **Pantalla de Usuarios en el ERP web** (listar/crear/editar/desactivar/asignar rol desde la web):
  hoy se hace por el panel de Django. Será un sub-proyecto aparte.
- Permisos a nivel de objeto (p. ej. "el técnico solo ve SUS órdenes"): fuera de alcance; el filtro
  `?technician=` ya permite ese caso desde la UI.
- Restringir la **lectura** o el **sidebar** por rol (se descartó: el modelo es "ver todo").
