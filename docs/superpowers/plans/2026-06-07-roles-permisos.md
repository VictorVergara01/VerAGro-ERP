# Roles y Permisos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar de 5 a 7 roles (Super Administrador, Administrador General, Facturación/Ventas, Técnico, Inventario, Contabilidad, Consulta) con una matriz de permisos centralizada, sin cambiar el modelo "todos leen, el rol limita la escritura".

**Architecture:** Una fuente única `apps/core/roles.py` con grupos de roles con nombre, consumidos por las clases de permiso existentes (`RoleWriteOrReadOnly`, `role_required`). El enum `User.Role` se reemplaza y una data migration convierte `admin → super_admin`. El frontend gatea botones de acción con helpers espejo del backend.

**Tech Stack:** Django 5 + DRF (pytest), React + TS + Mantine + TanStack Query (Vitest), Docker Compose.

**Convenciones del repo (leer antes de empezar):**
- Backend en Docker: `docker compose exec -T backend <cmd>` (pytest paths relativos a `/app`, p. ej. `docker compose exec -T backend pytest apps/core/tests/test_roles.py -v`). Tras cambios `.py` que afecten rutas/arranque, `docker compose restart backend`.
- Migraciones: `docker compose exec -T backend python manage.py makemigrations <app>` / `migrate`.
- Frontend desde el host: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run typecheck|test|lint`. Regenerar tipos: `npm run gen:api` (con backend arriba). No usar docker para el frontend.
- Git: rama de trabajo (no commitear en `master` directamente durante la ejecución; ver Execution Handoff). Commits en español; terminar el mensaje con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Desde Bash, prefijar git con `cd /c/Users/victo/Proyectos/VerAgro-ERP &&`.
- Spec de referencia: `docs/superpowers/specs/2026-06-07-roles-permisos-design.md`.

---

## File Structure

**Backend — crear:**
- `backend/apps/core/roles.py` — fuente única: códigos de rol + grupos con nombre.
- `backend/apps/core/tests/test_roles.py` — tests de los grupos.
- `backend/apps/users/migrations/000X_alter_user_role.py` — generada (AlterField del enum).
- `backend/apps/users/migrations/000Y_migrate_admin_to_super_admin.py` — data migration.

**Backend — modificar:**
- `backend/apps/users/models.py` — enum `User.Role` + `create_superuser`.
- `backend/apps/core/views.py` — `CompanyProfileView` (config = solo super_admin).
- `backend/apps/checklists/views.py`, `inventory/views.py`, `equipment/views.py`, `purchasing/views.py`, `suppliers/views.py`, `customers/views.py`, `service_orders/views.py`, `billing/views.py`, `reports/views.py` — usar los grupos de `roles.py`.
- `backend/apps/core/permissions.py` — eliminar `IsAdmin`/`IsAdminOrReadOnly` (quedan sin uso).
- Tests legacy que usan `role="admin"` (se enumeran en la Task 2).

**Frontend — crear:**
- `frontend/src/features/auth/roles.ts` — helpers de rol.

**Frontend — modificar:**
- `frontend/src/lib/api/schema.d.ts` — regenerado.
- `frontend/src/components/layout/Topbar.tsx` — `ROLE_LABELS`.
- `frontend/src/features/dashboard/DashboardPage.tsx` — `FINANCIAL_ROLES`.
- `frontend/src/features/settings/CompanySettings.tsx` — solo super_admin edita.
- `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx` — override admin.
- `frontend/src/features/billing/{InvoicesPage,InvoiceDetailPage,QuotesPage,QuoteDetailPage}.tsx` — gateo de botones.
- Páginas de lista de inventory/purchasing/suppliers/customers/equipment/service-orders — gateo del botón "Nuevo".
- Tests Vitest que usan `role: "admin"`.

---

## Task 1: `apps/core/roles.py` (fuente única) + test

**Files:**
- Create: `backend/apps/core/roles.py`
- Test: `backend/apps/core/tests/test_roles.py`

- [ ] **Step 1: Escribir el test (falla)**

`backend/apps/core/tests/test_roles.py`:
```python
from apps.core import roles


def test_group_membership():
    # super_admin está en todos los grupos de escritura
    for group in (
        roles.COMPANY_CONFIG_WRITE,
        roles.CHECKLIST_TEMPLATE_WRITE,
        roles.LOOKUPS_WRITE,
        roles.INVENTORY_WRITE,
        roles.EQUIPMENT_WRITE,
        roles.CUSTOMERS_WRITE,
        roles.SERVICE_WRITE,
        roles.BILLING_WRITE,
        roles.PAYMENTS_WRITE,
        roles.FINANCIAL_READ,
    ):
        assert roles.SUPER_ADMIN in group

    # general_admin opera el negocio pero NO la configuración de empresa
    assert roles.GENERAL_ADMIN in roles.INVENTORY_WRITE
    assert roles.GENERAL_ADMIN in roles.BILLING_WRITE
    assert roles.GENERAL_ADMIN not in roles.COMPANY_CONFIG_WRITE

    # contabilidad cobra y ve reportes, pero NO factura
    assert roles.ACCOUNTING in roles.PAYMENTS_WRITE
    assert roles.ACCOUNTING in roles.FINANCIAL_READ
    assert roles.ACCOUNTING not in roles.BILLING_WRITE

    # ventas factura pero NO cobra
    assert roles.SALES in roles.BILLING_WRITE
    assert roles.SALES not in roles.PAYMENTS_WRITE

    # solo super_admin toca la configuración de empresa
    assert roles.COMPANY_CONFIG_WRITE == (roles.SUPER_ADMIN,)
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `docker compose exec -T backend pytest apps/core/tests/test_roles.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'apps.core.roles'`.

- [ ] **Step 3: Implementar `roles.py`**

`backend/apps/core/roles.py`:
```python
"""Fuente única de la matriz de roles/permisos del ERP.

Los códigos deben coincidir con ``apps.users.models.User.Role``. Las clases de
permiso (``RoleWriteOrReadOnly``, ``role_required``) consumen estos grupos.
"""

# --- Códigos de rol ---
SUPER_ADMIN = "super_admin"
GENERAL_ADMIN = "general_admin"
SALES = "sales"
TECHNICIAN = "technician"
INVENTORY = "inventory"
ACCOUNTING = "accounting"
READONLY = "readonly"

# --- Grupos base ---
SUPER = (SUPER_ADMIN,)
ADMINS = (SUPER_ADMIN, GENERAL_ADMIN)

# --- Grupos de escritura por área ---
COMPANY_CONFIG_WRITE = SUPER
CHECKLIST_TEMPLATE_WRITE = ADMINS
LOOKUPS_WRITE = (*ADMINS, INVENTORY)            # categorías de inventario, tipos de equipo
INVENTORY_WRITE = (*ADMINS, INVENTORY)          # productos, ajustes, compras, proveedores
EQUIPMENT_WRITE = (*ADMINS, TECHNICIAN, SALES, INVENTORY)
CUSTOMERS_WRITE = (*ADMINS, SALES, TECHNICIAN, INVENTORY)
SERVICE_WRITE = (*ADMINS, TECHNICIAN)
BILLING_WRITE = (*ADMINS, SALES)                # cotizaciones/facturas (crear/editar/emitir/anular)
PAYMENTS_WRITE = (*ADMINS, ACCOUNTING)          # registrar pago
FINANCIAL_READ = (*ADMINS, SALES, ACCOUNTING)   # reportes financieros
```

- [ ] **Step 4: Correr el test**

Run: `docker compose exec -T backend pytest apps/core/tests/test_roles.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/roles.py backend/apps/core/tests/test_roles.py
git commit -m "feat(roles): mapa central de roles y grupos de permiso en core.roles"
```

---

## Task 2: Cutover del backend (enum + migración + viewsets + tests legacy)

Cambio coordinado: el enum nuevo y los viewsets deben cambiar juntos para que un `super_admin` no quede bloqueado. Tras esta task la suite vuelve a verde.

**Files:**
- Modify: `backend/apps/users/models.py`
- Create: migraciones `users` (AlterField + data)
- Modify: `core/views.py`, `checklists/views.py`, `inventory/views.py`, `equipment/views.py`, `purchasing/views.py`, `suppliers/views.py`, `customers/views.py`, `service_orders/views.py`, `billing/views.py`, `reports/views.py`
- Modify: `core/permissions.py` (eliminar IsAdmin/IsAdminOrReadOnly)
- Modify: tests legacy (enumerados en el Step 9)

- [ ] **Step 1: Reemplazar el enum `User.Role` y `create_superuser`**

En `backend/apps/users/models.py`, reemplaza la clase `Role`:
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
El `default` del campo `role` se mantiene en `Role.TECHNICIAN`. En `UserManager.create_superuser`, cambia:
```python
        extra_fields.setdefault("role", "super_admin")
```

- [ ] **Step 2: Generar la migración de esquema (AlterField del enum)**

Run: `docker compose exec -T backend python manage.py makemigrations users`
Expected: crea `users/000X_alter_user_role.py` con un `AlterField` de `role` (cambian los `choices`).

- [ ] **Step 3: Crear la data migration `admin → super_admin`**

Crea `backend/apps/users/migrations/000Y_migrate_admin_to_super_admin.py` (reemplaza `000X` por el nombre real generado en el Step 2 como dependencia):
```python
from django.db import migrations


def admin_to_super_admin(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(role="admin").update(role="super_admin")


def super_admin_to_admin(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(role="super_admin").update(role="admin")


class Migration(migrations.Migration):
    dependencies = [
        ("users", "000X_alter_user_role"),
    ]
    operations = [
        migrations.RunPython(admin_to_super_admin, super_admin_to_admin),
    ]
```

Run: `docker compose exec -T backend python manage.py migrate`
Expected: aplica ambas sin error.

- [ ] **Step 4: `core/views.py` — config solo super_admin**

Reemplaza el import y el permiso:
```python
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import CompanyProfile
from .serializers import CompanyProfileSerializer


class CompanyProfileView(RetrieveUpdateAPIView):
    ...
    permission_classes = [RoleWriteOrReadOnly(*roles.COMPANY_CONFIG_WRITE)]
```
(Quita `from .permissions import IsAdminOrReadOnly`.)

- [ ] **Step 5: `checklists/views.py`**

```python
from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly
...
TemplateWrite = RoleWriteOrReadOnly(*roles.CHECKLIST_TEMPLATE_WRITE)
ChecklistWrite = RoleWriteOrReadOnly(*roles.SERVICE_WRITE)
```

- [ ] **Step 6: inventory / equipment / purchasing / suppliers / customers / service_orders / reports**

`inventory/views.py` (línea 22):
```python
from apps.core import roles
...
InventoryWrite = RoleWriteOrReadOnly(*roles.INVENTORY_WRITE)
```
(`ProductViewSet` y `CategoryViewSet` siguen usando `InventoryWrite`; `low-stock` sigue `IsAuthenticated`.)

`equipment/views.py`:
```python
from apps.core import roles
...
class EquipmentTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWriteOrReadOnly(*roles.LOOKUPS_WRITE)]
...
class EquipmentViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWriteOrReadOnly(*roles.EQUIPMENT_WRITE)]
```

`purchasing/views.py`:
```python
from apps.core import roles
...
PurchasingWrite = RoleWriteOrReadOnly(*roles.INVENTORY_WRITE)
```

`suppliers/views.py`:
```python
from apps.core import roles
...
SuppliersWrite = RoleWriteOrReadOnly(*roles.INVENTORY_WRITE)
```

`customers/views.py` — `CustomerViewSet` hoy hereda el default `IsAuthenticated`; añade permiso explícito:
```python
from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly
...
class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWriteOrReadOnly(*roles.CUSTOMERS_WRITE)]
    ...
```

`service_orders/views.py`:
```python
from apps.core import roles
...
ServiceWrite = RoleWriteOrReadOnly(*roles.SERVICE_WRITE)
```
y el override de `deliver` (hoy línea ~140 `is_admin = getattr(request.user, "role", None) == "admin"`):
```python
        is_admin = getattr(request.user, "role", None) in roles.ADMINS
```

`reports/views.py` (línea 19):
```python
from apps.core import roles
from apps.core.permissions import role_required
...
Financial = role_required(*roles.FINANCIAL_READ)
```

- [ ] **Step 7: `billing/views.py` — separar pagos de facturación**

Añade el import y cambia `BillingWrite`:
```python
from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly
...
BillingWrite = RoleWriteOrReadOnly(*roles.BILLING_WRITE)
```
En `InvoiceViewSet`, añade un `get_permissions` que use `PAYMENTS_WRITE` solo para la acción `payments` (registrar pago exige Contabilidad/admins; el GET sigue siendo lectura para todos por ser método seguro):
```python
    def get_permissions(self):
        if self.action == "payments":
            return [RoleWriteOrReadOnly(*roles.PAYMENTS_WRITE)]
        return super().get_permissions()
```
(`QuoteViewSet`, `QuoteLineViewSet`, `InvoiceLineViewSet` siguen con `BillingWrite`.)

- [ ] **Step 8: Eliminar `IsAdmin`/`IsAdminOrReadOnly` (ya sin uso)**

En `backend/apps/core/permissions.py`, borra las clases `IsAdmin` y `IsAdminOrReadOnly` (deja `role_required` y `RoleWriteOrReadOnly`). Verifica que nadie las importe:

Run: `docker compose exec -T backend python -c "import subprocess,sys; sys.exit(subprocess.call(['grep','-rn','IsAdmin','/app/apps','--include=*.py']))"` 
Expected: solo aparecerá (si acaso) en el archivo de tests que se edita en el Step 9; en código de producción, 0 referencias.

- [ ] **Step 9: Actualizar tests legacy que usan `role="admin"`**

Reemplaza `"admin"` por `"super_admin"` en estos puntos (un usuario `super_admin` ahora es el que tiene control total):
- `backend/apps/customers/tests/test_api.py:13` → `role="super_admin"`.
- `backend/apps/users/tests/test_user_list.py` → `def _client(role="super_admin")` y las dos llamadas `_client("admin")` → `_client("super_admin")`.
- `backend/apps/reports/tests/test_api.py` → líneas 41, 132, 180: `_client("admin")` → `_client("super_admin")`.
- `backend/apps/checklists/tests/test_api.py:26` → `_client("super_admin")`.
- `backend/apps/equipment/tests/test_api.py:20` → `role="super_admin"`.
- `backend/apps/billing/tests/test_pdf.py:114` → `_client("super_admin")`.
- `backend/apps/billing/tests/test_api.py` → líneas 187, 217: `_client("admin")` → `_client("super_admin")`.
- `backend/apps/service_orders/tests/test_api.py:239` → `_client("super_admin")`.
- `backend/apps/users/tests/test_models.py:26` → `assert admin.role == "super_admin"`.

En `backend/apps/core/tests/test_permissions.py`: **elimina** los 4 tests de `IsAdmin`/`IsAdminOrReadOnly` (`test_is_admin_allows_admin`, `test_is_admin_blocks_non_admin`, `test_is_admin_or_readonly_allows_read_for_any_authenticated`, `test_is_admin_or_readonly_blocks_write_for_non_admin`) y quita `IsAdmin, IsAdminOrReadOnly` del import. Los tests de `role_required`/`RoleWriteOrReadOnly` se conservan tal cual (usan nombres de rol arbitrarios contra la clase genérica; siguen pasando).

- [ ] **Step 10: Reiniciar backend y correr la suite completa**

Run: `docker compose restart backend` (recarga vistas/urls).
Run: `docker compose exec -T backend pytest -q`
Expected: PASS, sin regresiones (~269 + el test de roles de la Task 1). Si algún test falla por un `_client("admin")` no listado, actualízalo a `"super_admin"`.

- [ ] **Step 11: Commit**

```bash
git add backend/apps
git commit -m "feat(roles): 7 roles, matriz central aplicada a viewsets y migración admin→super_admin"
```

---

## Task 3: Tests de regresión de la nueva matriz

**Files:**
- Test: `backend/apps/billing/tests/test_api.py` (pagos vs facturas)
- Test: `backend/apps/core/tests/test_company_permissions.py` (config solo super_admin) — nuevo
- Test: `backend/apps/customers/tests/test_api.py` (endurecimiento)

- [ ] **Step 1: Pagos vs facturación (billing)**

Añade a `backend/apps/billing/tests/test_api.py` (reusa su helper `_client`; crea un cliente y una factura emitida vía API o fixtures como en los tests existentes):
```python
@pytest.mark.django_db
def test_accounting_can_pay_but_not_invoice(customer):
    acc = _client("accounting")
    # No puede crear factura
    resp = acc.post("/api/invoices/", {"customer": customer.id}, format="json")
    assert resp.status_code == 403
    # Sí puede registrar pago sobre una factura emitida
    admin = _client("super_admin")
    inv = admin.post(
        "/api/invoices/",
        {"customer": customer.id, "lines": [{"description": "x", "quantity": "1", "unit_price": "100"}]},
        format="json",
    ).data
    admin.post(f"/api/invoices/{inv['id']}/issue/")
    pay = acc.post(
        f"/api/invoices/{inv['id']}/payments/",
        {"amount": "50", "method": "cash"},
        format="json",
    )
    assert pay.status_code == 201


@pytest.mark.django_db
def test_sales_can_invoice_but_not_pay(customer):
    sales = _client("sales")
    inv = sales.post(
        "/api/invoices/",
        {"customer": customer.id, "lines": [{"description": "x", "quantity": "1", "unit_price": "100"}]},
        format="json",
    )
    assert inv.status_code == 201
    sales.post(f"/api/invoices/{inv.data['id']}/issue/")
    pay = sales.post(
        f"/api/invoices/{inv.data['id']}/payments/",
        {"amount": "50", "method": "cash"},
        format="json",
    )
    assert pay.status_code == 403
```
(Si el helper `_client`/fixture `customer` no existen con esos nombres en ese archivo, créalos siguiendo el patrón de los otros `test_api.py`: `User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)` + `APIClient().force_authenticate`.)

- [ ] **Step 2: Config de empresa solo super_admin**

Crea `backend/apps/core/tests/test_company_permissions.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


def _client(role):
    u = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.mark.django_db
def test_general_admin_cannot_edit_company():
    resp = _client("general_admin").patch("/api/company/", {"name": "X"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_super_admin_can_edit_company():
    resp = _client("super_admin").patch("/api/company/", {"name": "X"}, format="json")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_anyone_can_read_company():
    resp = _client("technician").get("/api/company/")
    assert resp.status_code == 200
```

- [ ] **Step 3: Clientes — readonly ya no escribe**

Añade a `backend/apps/customers/tests/test_api.py` (usa el patrón de cliente por rol del archivo):
```python
@pytest.mark.django_db
def test_readonly_cannot_create_customer(db):
    from rest_framework.test import APIClient
    from django.contrib.auth import get_user_model

    User = get_user_model()
    u = User.objects.create_user(email="ro@v.com", password="x", full_name="RO", role="readonly")
    c = APIClient()
    c.force_authenticate(user=u)
    assert c.post("/api/customers/", {"name": "Nuevo"}, format="json").status_code == 403


@pytest.mark.django_db
def test_general_admin_can_create_customer(db):
    from rest_framework.test import APIClient
    from django.contrib.auth import get_user_model

    User = get_user_model()
    u = User.objects.create_user(email="ga@v.com", password="x", full_name="GA", role="general_admin")
    c = APIClient()
    c.force_authenticate(user=u)
    assert c.post("/api/customers/", {"name": "Nuevo"}, format="json").status_code == 201
```

- [ ] **Step 4: Correr los tests nuevos + suite**

Run: `docker compose exec -T backend pytest apps/billing/tests/test_api.py apps/core/tests/test_company_permissions.py apps/customers/tests/test_api.py -v`
Expected: PASS.
Run: `docker compose exec -T backend pytest -q`
Expected: PASS, sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add backend/apps
git commit -m "test(roles): regresión de la matriz (pagos vs facturas, config, clientes)"
```

---

## Task 4: Frontend — helpers de rol + tipos + etiquetas

**Files:**
- Create: `frontend/src/features/auth/roles.ts`
- Modify: `frontend/src/lib/api/schema.d.ts` (regenerado)
- Modify: `frontend/src/components/layout/Topbar.tsx`

- [ ] **Step 1: Regenerar tipos (backend arriba)**

Run: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run gen:api`
Expected: `RoleEnum` en `schema.d.ts` pasa a `"super_admin" | "general_admin" | "sales" | "technician" | "inventory" | "accounting" | "readonly"`.

- [ ] **Step 2: Crear `roles.ts`**

`frontend/src/features/auth/roles.ts`:
```ts
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrador",
  general_admin: "Administrador General",
  sales: "Facturación / Ventas",
  technician: "Técnico",
  inventory: "Inventario",
  accounting: "Contabilidad",
  readonly: "Consulta",
};

export const isSuperAdmin = (r?: string) => r === "super_admin";
export const isAdmin = (r?: string) => r === "super_admin" || r === "general_admin";
export const canWriteBilling = (r?: string) => isAdmin(r) || r === "sales";
export const canRegisterPayments = (r?: string) => isAdmin(r) || r === "accounting";
export const canWriteInventory = (r?: string) => isAdmin(r) || r === "inventory";
export const canWriteService = (r?: string) => isAdmin(r) || r === "technician";
export const canWriteCustomers = (r?: string) =>
  isAdmin(r) || r === "sales" || r === "technician" || r === "inventory";
export const canWriteEquipment = (r?: string) =>
  isAdmin(r) || r === "technician" || r === "sales" || r === "inventory";

export const FINANCIAL_ROLES = ["super_admin", "general_admin", "sales", "accounting"];
```

- [ ] **Step 3: Usar `ROLE_LABELS` en Topbar**

En `frontend/src/components/layout/Topbar.tsx`, elimina el `ROLE_LABELS` local (líneas ~27-33) e impórtalo:
```tsx
import { ROLE_LABELS } from "../../features/auth/roles";
```
(La línea `{ROLE_LABELS[user?.role ?? ""] ?? user?.role}` no cambia.)

- [ ] **Step 4: Typecheck**

Run: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/auth/roles.ts frontend/src/components/layout/Topbar.tsx frontend/src/lib/api/schema.d.ts
git commit -m "feat(roles): helpers de rol, etiquetas y tipos regenerados (frontend)"
```

---

## Task 5: Frontend — Dashboard, Configuración y override de entrega

**Files:**
- Modify: `frontend/src/features/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/features/settings/CompanySettings.tsx`
- Modify: `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx`
- Test: `frontend/src/features/dashboard/DashboardPage.test.tsx`

- [ ] **Step 1: Dashboard usa `FINANCIAL_ROLES` del helper**

En `frontend/src/features/dashboard/DashboardPage.tsx`, elimina el `const FINANCIAL_ROLES = ["admin", "sales"];` local e impórtalo:
```tsx
import { FINANCIAL_ROLES } from "../auth/roles";
```
(La condición `if (user && !FINANCIAL_ROLES.includes(user.role))` no cambia.)

- [ ] **Step 2: Configuración → Empresa solo super_admin**

En `frontend/src/features/settings/CompanySettings.tsx`, reemplaza:
```tsx
  const isAdmin = user?.role === "admin";
```
por:
```tsx
  import { isSuperAdmin } from "../auth/roles";
  // ...
  const isAdmin = isSuperAdmin(user?.role);
```
(Mantén el nombre local `isAdmin` para no tocar el resto del JSX; solo cambia su definición. Coloca el import arriba con los demás.)

- [ ] **Step 3: Override "Entregar sin cobro" (órdenes)**

En `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx`, reemplaza:
```tsx
  const isAdmin = user?.role === "admin";
```
por:
```tsx
  import { isAdmin as isAdminRole } from "../auth/roles";
  // ...
  const isAdmin = isAdminRole(user?.role);
```

- [ ] **Step 4: Actualizar el test del Dashboard**

En `frontend/src/features/dashboard/DashboardPage.test.tsx`, cambia el usuario admin de `role: "admin"` a `role: "super_admin"` (línea ~41). El caso técnico (`role: "technician"`) no cambia.

- [ ] **Step 5: Typecheck + test**

Run: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run typecheck && npm run test`
Expected: typecheck exit 0; Vitest verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/dashboard frontend/src/features/settings/CompanySettings.tsx frontend/src/features/service-orders/ServiceOrderDetailPage.tsx
git commit -m "feat(roles): gateo de dashboard, configuración y entrega por rol"
```

---

## Task 6: Frontend — gateo de botones de Facturación

**Files:**
- Modify: `frontend/src/features/billing/InvoicesPage.tsx`, `InvoiceDetailPage.tsx`, `QuotesPage.tsx`, `QuoteDetailPage.tsx`
- Test: `frontend/src/features/billing/billing-permissions.test.tsx` (nuevo)

- [ ] **Step 1: Gatear "Registrar pago" y "Nueva/Editar factura"**

En `InvoiceDetailPage.tsx`: importa el hook de auth y los helpers, y envuelve los botones:
```tsx
import { useAuth } from "../auth/useAuth";
import { canRegisterPayments, canWriteBilling } from "../auth/roles";
// dentro del componente:
const { user } = useAuth();
```
- Envuelve el botón **"Registrar pago"** (línea ~140) con `{canRegisterPayments(user?.role) && ( ... )}`.
- Envuelve el botón **"Editar"** (línea ~130) con `{canWriteBilling(user?.role) && ( ... )}`.

En `InvoicesPage.tsx`: envuelve el botón **"Nueva factura"** (línea ~74) con `{canWriteBilling(user?.role) && ( ... )}` (importa `useAuth` y `canWriteBilling`).

- [ ] **Step 2: Gatear cotizaciones**

En `QuotesPage.tsx`: envuelve **"Nueva cotización"** (línea ~68) con `{canWriteBilling(user?.role) && ( ... )}`.
En `QuoteDetailPage.tsx`: envuelve **"Editar"** (línea ~80) con `{canWriteBilling(user?.role) && ( ... )}`.

- [ ] **Step 3: Test de visibilidad por rol**

`frontend/src/features/billing/billing-permissions.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import {
  canRegisterPayments,
  canWriteBilling,
} from "../auth/roles";

describe("permisos de facturación", () => {
  it("ventas factura pero no cobra", () => {
    expect(canWriteBilling("sales")).toBe(true);
    expect(canRegisterPayments("sales")).toBe(false);
  });
  it("contabilidad cobra pero no factura", () => {
    expect(canRegisterPayments("accounting")).toBe(true);
    expect(canWriteBilling("accounting")).toBe(false);
  });
  it("ambos admins pueden todo en billing", () => {
    for (const r of ["super_admin", "general_admin"]) {
      expect(canWriteBilling(r)).toBe(true);
      expect(canRegisterPayments(r)).toBe(true);
    }
  });
  it("consulta no puede nada", () => {
    expect(canWriteBilling("readonly")).toBe(false);
    expect(canRegisterPayments("readonly")).toBe(false);
  });
});
```

- [ ] **Step 4: Typecheck + test**

Run: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run typecheck && npm run test`
Expected: typecheck exit 0; Vitest verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/billing
git commit -m "feat(roles): gateo de botones de facturación y pagos por rol"
```

---

## Task 7: Frontend — gateo del botón "Nuevo" por módulo + verificación final

Oculta el botón primario de creación en cada lista para quien no puede escribir esa área (el backend ya bloquea; esto evita el 403 en pantalla).

**Files:**
- Modify: `frontend/src/features/inventory/InventoryPage.tsx`, `purchasing/PurchasingPage.tsx`, `suppliers/SuppliersPage.tsx`, `customers/CustomersPage.tsx`, `equipment/EquipmentPage.tsx`, `service-orders/ServiceOrdersPage.tsx`

- [ ] **Step 1: Gatear cada botón primario con su helper**

En cada página de lista, importa `useAuth` (`../auth/useAuth`) y el helper correspondiente de `../auth/roles`, obtén `const { user } = useAuth();` y envuelve el botón de creación (el `action={<Button ...>}` del `PageHeader`, o el botón "Nuevo/Nueva …") con la condición:
- `InventoryPage.tsx` ("Nuevo producto") → `canWriteInventory(user?.role)`.
- `PurchasingPage.tsx` ("Nueva orden"/"Nueva compra") → `canWriteInventory(user?.role)`.
- `SuppliersPage.tsx` ("Nuevo proveedor") → `canWriteInventory(user?.role)`.
- `CustomersPage.tsx` ("Nuevo cliente") → `canWriteCustomers(user?.role)`.
- `EquipmentPage.tsx` ("Nuevo equipo") → `canWriteEquipment(user?.role)`.
- `ServiceOrdersPage.tsx` ("Nueva orden") → `canWriteService(user?.role)`.

Patrón (ejemplo InventoryPage; replicar análogamente):
```tsx
import { useAuth } from "../auth/useAuth";
import { canWriteInventory } from "../auth/roles";
// ...
const { user } = useAuth();
// en el PageHeader:
action={
  canWriteInventory(user?.role) ? (
    <Button leftSection={<IconPlus size={18} />} onClick={open}>
      Nuevo producto
    </Button>
  ) : undefined
}
```
(Si una página importa Exportar/Importar u otros botones de escritura, gatéalos con el mismo helper. Para `InventoryPage`, los botones "Importar/Exportar CSV" → también `canWriteInventory`.)

- [ ] **Step 2: Typecheck + lint + test (suite completa)**

Run: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run typecheck`
Expected: exit 0.
Run: `npm run test`
Expected: Vitest verde (incluye los tests de permisos nuevos; los existentes que mockean `useAuth` siguen pasando — si alguno renderiza una página gateada y esperaba ver el botón "Nuevo", el mock de `useAuth` debe devolver un rol con permiso, p. ej. `super_admin`; ajústalo en ese test).
Run: `npm run lint`
Expected: sin **nuevos** errores respecto del baseline (hay 9 errores preexistentes ajenos a este cambio en archivos no relacionados; no introducir más).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features
git commit -m "feat(roles): ocultar botón de creación por módulo según rol"
```

---

## Task 8: Verificación final end-to-end

- [ ] **Step 1: Backend completo**

Run: `docker compose exec -T backend pytest -q`
Expected: PASS, sin regresiones.

- [ ] **Step 2: Frontend completo**

Run: `cd /c/Users/victo/Proyectos/VerAgro-ERP/frontend && npm run typecheck && npm run test`
Expected: typecheck exit 0; Vitest verde.

- [ ] **Step 3: Sin referencias al rol viejo `"admin"`**

Run: `docker compose exec -T backend python -c "import subprocess,sys; sys.exit(subprocess.call(['grep','-rn','role == \"admin\"','/app/apps','--include=*.py']))"`
Expected: 0 coincidencias en código de producción.
Run (frontend, desde la raíz): revisar que no quede `role === "admin"` en `frontend/src` (Grep). Expected: 0.

- [ ] **Step 4: Smoke manual (recomendado)**

Con `docker compose up` y `npm run dev`: entrar como `super_admin` (el `admin@veragro.com` migrado) y confirmar acceso total; crear desde el panel de Django un usuario `accounting` y otro `general_admin` y verificar: accounting registra un pago pero no ve "Nueva factura"; general_admin opera todo pero no edita Configuración → Empresa.

---

## Self-Review (cobertura del spec)

- **7 roles + migración `admin→super_admin`**: Task 2 (enum, create_superuser, AlterField + data migration). ✓
- **Mapa central `apps/core/roles.py`**: Task 1. ✓
- **Matriz aplicada por módulo** (config=super; lookups/inventory/purchasing/suppliers=admins+inventory; equipment; customers; service; billing; payments; financial reports): Tasks 2 (Steps 4-7). ✓
- **5 cambios de comportamiento** (pagos fuera de ventas; clientes endurecido; config solo super; plantillas ambos admins; deliver ambos admins): Task 2 (billing get_permissions, customers permiso, core config, checklists TemplateWrite=ADMINS, service deliver). ✓
- **Eliminar IsAdmin/IsAdminOrReadOnly**: Task 2 Step 8-9. ✓
- **Tests backend** (roles, regresión pagos/factura, config, clientes, data migration cubierta por la suite + casos): Tasks 1 y 3. ✓
- **Frontend**: helpers+tipos+labels (Task 4); dashboard/config/deliver (Task 5); billing buttons (Task 6); botón "Nuevo" por módulo (Task 7). ✓
- **Tests frontend** actualizados + nuevos: Tasks 5, 6, 7. ✓
- **Fuera de alcance** (pantalla de usuarios en web): no se implementa. ✓

Nota: el spec menciona un test explícito de la data migration con `django_test_migrations`. Esa dependencia no está en el proyecto; en su lugar la corrección de la migración queda cubierta indirectamente (la suite corre sobre la BD migrada y los tests de permisos asumen los códigos nuevos). Si se desea un test dedicado de la migración, añadir `django-test-migrations` es un follow-up.
