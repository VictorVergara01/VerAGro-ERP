# Nuevo rol "Piloto" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un 8º rol `piloto` (operación de campo/fumigación) que escribe Trabajos de campo y Clientes, lee equipos, no factura, ve solo sus propios trabajos, en web y móvil.

**Architecture:** El rol se añade al enum `User.Role` y a la matriz central `apps/core/roles.py` (fuente única). El viewset de trabajos de campo restringe el queryset por usuario cuando el rol es piloto (restricción dura) y auto-asigna al creador. Web y móvil reflejan el rol en sus espejos `roles.ts` y ocultan la navegación no permitida; la visibilidad "solo los suyos" la garantiza el backend, así que el front no necesita filtros extra.

**Tech Stack:** Django + DRF (backend), React 19 + TS + Mantine 9 + Vitest (web), Expo/React Native + TS (móvil).

## Global Constraints

- Código de rol exacto: `"piloto"`; etiqueta exacta: `"Piloto"`.
- No renombrar el campo `FieldJob.technician` (ya etiquetado "Piloto" en UI).
- Commits en español; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Backend en Docker: tras crear migraciones correr `migrate` en el contenedor (ver `backend-autoreload-windows`). Tests backend: `docker compose exec backend pytest <ruta> -v`.
- Web: gate `npx vitest run` + `npm run build`. Móvil: gate `npm run typecheck` (no hay framework de tests).
- Rama de trabajo: `V3.0`. No mergear a master/V2.0.

---

### Task 1: Rol `piloto` en el modelo y la matriz central

**Files:**
- Modify: `backend/apps/users/models.py:31-38` (enum `Role`)
- Modify: `backend/apps/core/roles.py`
- Create: `backend/apps/users/migrations/0004_alter_user_role.py` (generada por makemigrations; el número real puede variar — usar el que asigne Django)
- Test: `backend/apps/customers/tests/` (nuevo archivo `test_piloto_permissions.py`)

**Interfaces:**
- Produces: `apps.core.roles.PILOTO = "piloto"`; grupo `apps.core.roles.FIELD_JOBS_WRITE = (SUPER_ADMIN, GENERAL_ADMIN, TECHNICIAN, SALES, PILOTO)`; `CUSTOMERS_WRITE` ahora incluye `PILOTO`.

- [ ] **Step 1: Escribir el test que falla (clientes los puede escribir un piloto)**

Crear `backend/apps/customers/tests/test_piloto_permissions.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.users.models import User

pytestmark = pytest.mark.django_db

CUSTOMERS_URL = "/api/customers/"


def _client_for_role(role):
    user = User.objects.create_user(
        email=f"{role}@test.com", password="x", role=role, full_name="Test User"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_piloto_role_exists():
    assert User.Role.PILOTO == "piloto"
    assert User.Role.PILOTO.label == "Piloto"


def test_piloto_can_create_customer():
    client = _client_for_role("piloto")
    res = client.post(CUSTOMERS_URL, {"name": "Finca del Piloto"}, format="json")
    assert res.status_code == 201, res.content


def test_readonly_still_cannot_create_customer():
    client = _client_for_role("readonly")
    res = client.post(CUSTOMERS_URL, {"name": "X"}, format="json")
    assert res.status_code == 403, res.content
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec backend pytest apps/customers/tests/test_piloto_permissions.py -v`
Expected: FAIL (`AttributeError: PILOTO` / o el piloto recibe 403 al crear cliente).

- [ ] **Step 3: Agregar el rol al enum del modelo**

En `backend/apps/users/models.py`, dentro de `class Role(models.TextChoices)`, añadir tras `TECHNICIAN`:

```python
        TECHNICIAN = "technician", "Técnico"
        PILOTO = "piloto", "Piloto"
        INVENTORY = "inventory", "Inventario"
```

- [ ] **Step 4: Actualizar la matriz central de roles**

En `backend/apps/core/roles.py`:

```python
SALES = "sales"
TECHNICIAN = "technician"
PILOTO = "piloto"
INVENTORY = "inventory"
```

Y en los grupos de escritura:

```python
CUSTOMERS_WRITE = (*ADMINS, SALES, TECHNICIAN, INVENTORY, PILOTO)
FIELD_JOBS_WRITE = (*ADMINS, TECHNICIAN, SALES, PILOTO)
```

(Agregar la línea `FIELD_JOBS_WRITE` junto a los demás grupos de escritura por área.)

- [ ] **Step 5: Generar y aplicar la migración**

Run:
```bash
docker compose exec backend python manage.py makemigrations users
docker compose exec backend python manage.py migrate
```
Expected: crea `users/migrations/0004_alter_user_role.py` (AlterField del campo `role`) y la aplica sin errores.

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `docker compose exec backend pytest apps/customers/tests/test_piloto_permissions.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/users/models.py backend/apps/core/roles.py \
  backend/apps/users/migrations/ backend/apps/customers/tests/test_piloto_permissions.py
git commit -m "feat(roles): nuevo rol piloto en modelo y matriz central

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Trabajos de campo — escritura, restricción dura y blindaje de facturación

**Files:**
- Modify: `backend/apps/field_jobs/views.py`
- Test: `backend/apps/field_jobs/tests/test_permissions.py` (añadir casos)
- Create: `backend/apps/field_jobs/tests/test_piloto.py`

**Interfaces:**
- Consumes: `apps.core.roles.FIELD_JOBS_WRITE`, `apps.core.roles.BILLING_WRITE`, `apps.core.roles.PILOTO` (Task 1).
- Produces: `FieldJobViewSet` con queryset restringido para piloto, auto-asignación en create y `generate-invoice` gateada a `BILLING_WRITE`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/field_jobs/tests/test_piloto.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.users.models import User

pytestmark = pytest.mark.django_db

URL = "/api/field-jobs/"


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca Piloto")


def _piloto(email="piloto@test.com"):
    return User.objects.create_user(
        email=email, password="x", role="piloto", full_name="Pil Oto"
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_piloto_can_create_field_job(customer):
    res = _client(_piloto()).post(URL, {"customer": customer.id}, format="json")
    assert res.status_code == 201, res.content


def test_create_auto_assigns_piloto_as_technician(customer):
    piloto = _piloto()
    res = _client(piloto).post(URL, {"customer": customer.id}, format="json")
    assert res.status_code == 201, res.content
    assert res.json()["technician"] == piloto.id


def test_piloto_sees_only_own_jobs(customer):
    mine = _piloto("mine@test.com")
    other = _piloto("other@test.com")
    job_mine = FieldJob.objects.create(customer=customer, technician=mine)
    job_other = FieldJob.objects.create(customer=customer, technician=other)

    res = _client(mine).get(URL)
    assert res.status_code == 200, res.content
    ids = [row["id"] for row in res.json()["results"]]
    assert job_mine.id in ids
    assert job_other.id not in ids


def test_piloto_retrieve_other_job_is_404(customer):
    mine = _piloto("mine2@test.com")
    other = _piloto("other2@test.com")
    job_other = FieldJob.objects.create(customer=customer, technician=other)
    res = _client(mine).get(f"{URL}{job_other.id}/")
    assert res.status_code == 404, res.content


def test_piloto_cannot_generate_invoice(customer):
    piloto = _piloto()
    job = FieldJob.objects.create(customer=customer, technician=piloto)
    res = _client(piloto).post(f"{URL}{job.id}/generate-invoice/", {}, format="json")
    assert res.status_code == 403, res.content
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec backend pytest apps/field_jobs/tests/test_piloto.py -v`
Expected: FAIL (piloto no está en write_roles aún / no hay restricción ni auto-asignación / generate-invoice 201).

- [ ] **Step 3: Actualizar el viewset**

En `backend/apps/field_jobs/views.py`:

Reemplazar la definición del permiso:
```python
FieldJobWrite = RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)
```

En `get_queryset`, tras construir `qs` con `select_related/prefetch_related`, añadir la restricción dura:
```python
    def get_queryset(self):
        qs = FieldJob.objects.select_related(
            "customer", "equipment", "technician"
        ).prefetch_related("invoices", "products")
        user = self.request.user
        if user.role == roles.PILOTO:
            qs = qs.filter(technician_id=user.id)
        params = self.request.query_params
        ...
```

Reemplazar `perform_create` para auto-asignar al piloto:
```python
    def perform_create(self, serializer):
        extra = {"created_by": self.request.user}
        user = self.request.user
        if user.role == roles.PILOTO and not serializer.validated_data.get("technician"):
            extra["technician"] = user
        job = serializer.save(**extra)
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])
        if job.technician_id:
            from apps.notifications.services import notify_assignment

            notify_assignment(job, job.technician)
```

Gatear la acción `generate-invoice` con su propio permiso (admins + ventas):
```python
    @action(
        detail=True,
        methods=["post"],
        url_path="generate-invoice",
        permission_classes=[RoleWriteOrReadOnly(*roles.BILLING_WRITE)],
    )
    def generate_invoice(self, request, pk=None):
        ...
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `docker compose exec backend pytest apps/field_jobs/tests/test_piloto.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificar que no hubo regresión en permisos previos**

Run: `docker compose exec backend pytest apps/field_jobs/ -v`
Expected: PASS (incluye `test_permissions.py`, `test_api.py`, etc.).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/field_jobs/views.py backend/apps/field_jobs/tests/test_piloto.py
git commit -m "feat(field-jobs): piloto escribe y ve solo lo suyo; generate-invoice solo facturacion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web — espejo de roles y gateo de navegación (lógica)

**Files:**
- Modify: `frontend/src/features/auth/roles.ts`
- Create: `frontend/src/features/auth/roles.test.ts`

**Interfaces:**
- Produces: `isPiloto`, `canWriteFieldJobs`, `canWriteCustomers` (actualizado), `canSeeNav(role, to)`; `ROLE_LABELS.piloto`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/auth/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ROLE_LABELS,
  isPiloto,
  canWriteFieldJobs,
  canWriteCustomers,
  canSeeNav,
} from "./roles";

describe("rol piloto", () => {
  it("tiene etiqueta", () => {
    expect(ROLE_LABELS.piloto).toBe("Piloto");
  });

  it("isPiloto detecta el rol", () => {
    expect(isPiloto("piloto")).toBe(true);
    expect(isPiloto("technician")).toBe(false);
  });

  it("puede escribir trabajos de campo y clientes", () => {
    expect(canWriteFieldJobs("piloto")).toBe(true);
    expect(canWriteCustomers("piloto")).toBe(true);
  });

  it("solo ve Dashboard, Trabajos de campo y Clientes en la navegación", () => {
    expect(canSeeNav("piloto", "/")).toBe(true);
    expect(canSeeNav("piloto", "/field-jobs")).toBe(true);
    expect(canSeeNav("piloto", "/customers")).toBe(true);
    expect(canSeeNav("piloto", "/service-orders")).toBe(false);
    expect(canSeeNav("piloto", "/inventory")).toBe(false);
    expect(canSeeNav("piloto", "/invoices")).toBe(false);
    expect(canSeeNav("piloto", "/settings")).toBe(false);
  });

  it("otros roles ven toda la navegación", () => {
    expect(canSeeNav("general_admin", "/settings")).toBe(true);
    expect(canSeeNav("technician", "/inventory")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/auth/roles.test.ts`
Expected: FAIL (`isPiloto`/`canSeeNav` no existen).

- [ ] **Step 3: Implementar en roles.ts**

En `frontend/src/features/auth/roles.ts`:

Añadir la etiqueta dentro de `ROLE_LABELS`:
```ts
  technician: "Técnico",
  piloto: "Piloto",
  inventory: "Inventario",
```

Añadir helpers (junto a los demás):
```ts
export const isPiloto = (r?: string) => r === "piloto";
export const canWriteFieldJobs = (r?: string) =>
  isAdmin(r) || r === "technician" || r === "sales" || r === "piloto";
```

Actualizar `canWriteCustomers`:
```ts
export const canWriteCustomers = (r?: string) =>
  isAdmin(r) || r === "sales" || r === "technician" || r === "inventory" || r === "piloto";
```

Añadir el gateo de navegación al final del archivo:
```ts
// Rutas que un piloto NO ve en la navegación (solo campo + clientes + dashboard).
const PILOTO_HIDDEN = new Set([
  "/service-orders",
  "/equipment",
  "/inventory",
  "/suppliers",
  "/purchasing",
  "/quotes",
  "/invoices",
  "/reports",
  "/settings",
]);

export const canSeeNav = (role: string | undefined, to: string) =>
  role === "piloto" ? !PILOTO_HIDDEN.has(to) : true;
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npx vitest run src/features/auth/roles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/auth/roles.ts frontend/src/features/auth/roles.test.ts
git commit -m "feat(web roles): helpers y gateo de navegacion del rol piloto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web — selector "Piloto" lista solo pilotos

**Files:**
- Modify: `frontend/src/features/service-orders/api.ts` (añadir `usePilots`)
- Modify: `frontend/src/features/field-jobs/FieldJobFormModal.tsx`
- Modify: `frontend/src/features/field-jobs/field-job-form.test.tsx` (ajustar mock)

**Interfaces:**
- Consumes: `UserOption` (ya exportado en `service-orders/api.ts`).
- Produces: `usePilots()` → `useQuery` que devuelve `UserOption[]` filtrando `?role=piloto`.

- [ ] **Step 1: Añadir el hook `usePilots`**

En `frontend/src/features/service-orders/api.ts`, justo debajo de `useTechnicians`:

```ts
export function usePilots() {
  return useQuery({
    queryKey: ["users", "piloto"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/users/", {
        // El OpenAPI no declara ?role= (la vista lo lee a mano).
        params: { query: { role: "piloto" } as unknown as never },
      });
      if (error || !data) return [] as UserOption[];
      return data as unknown as UserOption[];
    },
  });
}
```

- [ ] **Step 2: Usar `usePilots` en el formulario**

En `frontend/src/features/field-jobs/FieldJobFormModal.tsx`:

Cambiar el import:
```ts
import { usePilots } from "../service-orders/api";
```

Cambiar la llamada al hook:
```ts
  const pilots = usePilots();
```

Cambiar el `data` del Select "Piloto" (líneas ~183):
```tsx
            <Select
              label="Piloto"
              placeholder="Sin asignar"
              data={(pilots.data ?? []).map((t) => ({ value: String(t.id), label: t.full_name }))}
              searchable
              clearable
              {...form.getInputProps("technician")}
            />
```

- [ ] **Step 3: Ajustar el mock del test del formulario**

En `frontend/src/features/field-jobs/field-job-form.test.tsx`, reemplazar el mock de `../service-orders/api`:
```ts
vi.mock("../service-orders/api", () => ({ usePilots: () => ({ data: [] }) }));
```

- [ ] **Step 4: Correr los tests del formulario y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/field-jobs/field-job-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificar el resto de la suite de field-jobs (mocks que aún usen useTechnicians)**

Run: `cd frontend && npx vitest run src/features/field-jobs/`
Expected: PASS. Si `field-jobs-page.test.tsx` o `field-job-detail.test.tsx` mockean `../service-orders/api` con `useTechnicians`, añadir también `usePilots: () => ({ data: [] })` a esos mocks para no romperlos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/service-orders/api.ts \
  frontend/src/features/field-jobs/FieldJobFormModal.tsx \
  frontend/src/features/field-jobs/field-job-form.test.tsx
git commit -m "feat(web field-jobs): selector de piloto lista usuarios rol piloto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — aplicar el gateo en el Sidebar y quick link de campo

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/features/dashboard/DashboardPage.tsx` (añadir quick link a Trabajos de campo)

**Interfaces:**
- Consumes: `canSeeNav` (Task 3), `useAuth` (`../../features/auth/useAuth`).

- [ ] **Step 1: Filtrar la navegación por rol en el Sidebar**

En `frontend/src/components/layout/Sidebar.tsx`:

Añadir imports:
```ts
import { useAuth } from "../../features/auth/useAuth";
import { canSeeNav } from "../../features/auth/roles";
```

Dentro de `Sidebar`, tras `const { pathname } = useLocation();`:
```ts
  const { user } = useAuth();
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNav(user?.role, item.to)),
  })).filter((group) => group.items.length > 0);
```

Cambiar el `.map` de render para iterar `groups` en vez de `NAV_GROUPS`:
```tsx
        {groups.map((group) => (
```

- [ ] **Step 2: Añadir "Trabajos de campo" a los accesos rápidos operativos**

En `frontend/src/features/dashboard/DashboardPage.tsx`, importar el icono y añadir el quick link al inicio de `QUICK_LINKS`:

```ts
import { IconDrone } from "@tabler/icons-react";
```
(añadir `IconDrone` a la lista de imports de `@tabler/icons-react`)

```ts
const QUICK_LINKS: QuickLink[] = [
  {
    label: "Trabajos de campo",
    description: "Programa, registra químicos y calcula la mezcla.",
    to: "/field-jobs",
    icon: IconDrone,
    color: "lime",
  },
  {
    label: "Órdenes de servicio",
    ...
```

- [ ] **Step 3: Verificar build y typecheck**

Run: `cd frontend && npm run build`
Expected: build OK (incluye `tsc`).

- [ ] **Step 4: Verificar la suite completa del web**

Run: `cd frontend && npx vitest run`
Expected: PASS (toda la suite).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/features/dashboard/DashboardPage.tsx
git commit -m "feat(web nav): ocultar secciones no permitidas al piloto + acceso rapido a campo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Móvil — espejo de roles

**Files:**
- Modify: `mobile/src/features/auth/roles.ts`

**Interfaces:**
- Produces: `ROLE_LABELS.piloto`, `isPiloto`.

- [ ] **Step 1: Añadir piloto al espejo de roles del móvil**

En `mobile/src/features/auth/roles.ts`:

Añadir la etiqueta dentro de `ROLE_LABELS`:
```ts
  technician: "Técnico",
  piloto: "Piloto",
  inventory: "Inventario",
```

Añadir el helper junto a los demás:
```ts
export const isPiloto = (r?: string) => r === "piloto";
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd mobile && npm run typecheck`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/auth/roles.ts
git commit -m "feat(movil roles): rol piloto en el espejo de roles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Móvil — gateo de navegación para el piloto

**Files:**
- Modify: `mobile/src/navigation/MainTabs.tsx`
- Modify: `mobile/src/features/menu/MenuScreen.tsx`

**Interfaces:**
- Consumes: `isPiloto` (Task 6), `useAuth` (`../features/auth/useAuth` / `../auth/useAuth`).

- [ ] **Step 1: Ocultar las pestañas no permitidas al piloto**

En `mobile/src/navigation/MainTabs.tsx`:

Añadir imports:
```ts
import { useAuth } from "../features/auth/useAuth";
import { isPiloto } from "../features/auth/roles";
```

Dentro de `MainTabs`, obtener el rol:
```ts
export function MainTabs() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const piloto = isPiloto(user?.role);
```

Envolver las pestañas `OrdersTab` e `InventoryTab` para que no se rendericen si es piloto:
```tsx
      {!piloto && (
        <Tab.Screen
          name="OrdersTab"
          component={OrdersNavigator}
          options={{
            title: "Órdenes",
            tabBarIcon: ({ color, size }) => <Ionicons name="construct" size={size} color={color} />,
          }}
        />
      )}
      {!piloto && (
        <Tab.Screen
          name="InventoryTab"
          component={InventoryNavigator}
          options={{
            title: "Inventario",
            tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
          }}
        />
      )}
```

(El piloto queda con las pestañas Inicio, Campo y Más.)

- [ ] **Step 2: Reducir el menú "Más" para el piloto**

En `mobile/src/features/menu/MenuScreen.tsx`:

Añadir el import del helper:
```ts
import { ROLE_LABELS, isPiloto } from "../auth/roles";
```

Construir los grupos condicionalmente. Reemplazar la asignación de `groups` por una que, si es piloto, solo muestre Clientes y Mi perfil:

```ts
  const piloto = isPiloto(user?.role);

  const groups: { title: string; items: Item[] }[] = piloto
    ? [
        {
          title: "Menú",
          items: [
            { label: "Clientes", icon: "people", color: colors.warning, onPress: () => nav.navigate("Customers") },
          ],
        },
        {
          title: "General",
          items: [
            { label: "Mi perfil", icon: "person", color: colors.primary, onPress: () => nav.navigate("Profile") },
          ],
        },
      ]
    : [
        {
          title: "Menú",
          items: [
            { label: "Clientes", icon: "people", color: colors.warning, onPress: () => nav.navigate("Customers") },
            { label: "Equipos", icon: "hardware-chip", color: colors.grape, onPress: () => nav.navigate("Equipment") },
            { label: "Proveedores", icon: "car", color: colors.info, onPress: () => nav.navigate("Suppliers") },
            { label: "Compras", icon: "cart", color: colors.teal, onPress: () => nav.navigate("Purchasing") },
          ],
        },
        {
          title: "Facturación",
          items: [
            { label: "Cotizaciones", icon: "document-text", color: colors.info, onPress: () => nav.navigate("Quotes") },
            { label: "Facturas", icon: "receipt", color: colors.grape, onPress: () => nav.navigate("Invoices") },
          ],
        },
        {
          title: "General",
          items: [
            { label: "Reportes", icon: "bar-chart", color: colors.primary, onPress: () => nav.navigate("Reports") },
            { label: "Configuración", icon: "settings", color: colors.dimmed, onPress: () => nav.navigate("Settings") },
            { label: "Mi perfil", icon: "person", color: colors.primary, onPress: () => nav.navigate("Profile") },
          ],
        },
      ];
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd mobile && npm run typecheck`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/navigation/MainTabs.tsx mobile/src/features/menu/MenuScreen.tsx
git commit -m "feat(movil nav): el piloto solo ve campo, clientes y su perfil

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Regenerar tipos de OpenAPI (opcional, cosmético)

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts`
- Modify: `mobile/src/lib/api/schema.d.ts`

**Interfaces:** ninguna nueva. Sincroniza el `RoleEnum` del schema con el backend (8 roles).

- [ ] **Step 1: Con el backend corriendo, regenerar los tipos del web**

Run: `cd frontend && npm run gen:api`
Expected: `schema.d.ts` actualizado; `RoleEnum` incluye `"piloto"`.

- [ ] **Step 2: Regenerar los tipos del móvil**

Run: `cd mobile && npm run gen:api`
Expected: `schema.d.ts` actualizado.

- [ ] **Step 3: Verificar typecheck/build en ambos**

Run: `cd frontend && npm run build` ; `cd mobile && npm run typecheck`
Expected: OK en ambos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/schema.d.ts mobile/src/lib/api/schema.d.ts
git commit -m "chore(api): regenerar tipos OpenAPI con el rol piloto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Modelo + matriz (`piloto`, `FIELD_JOBS_WRITE`, `CUSTOMERS_WRITE`): Task 1. ✓
- Equipos solo-lectura: no se agrega piloto a `EQUIPMENT_WRITE` (Task 1 lo deja fuera). ✓
- Restricción dura "solo los suyos" + auto-asignación: Task 2. ✓
- No factura (blindaje `generate-invoice`): Task 2. ✓
- Web roles + nav + dashboard operativo: Tasks 3 y 5 (el dashboard operativo ya lo da `FINANCIAL_ROLES`, que no incluye piloto; se añade el quick link de campo). ✓
- Web selector solo-pilotos: Task 4. ✓
- Móvil espejo + abrir menú al piloto (campo + clientes): Tasks 6 y 7. ✓
- Tests backend/web/móvil typecheck: en cada task. ✓
- Sin renombrar `FieldJob.technician`: respetado. ✓

**Placeholder scan:** sin TBD/TODO; todo el código a aplicar está mostrado.

**Type consistency:** `usePilots` reutiliza `UserOption`; `canSeeNav(role, to)` mismo nombre en Task 3 (def) y Task 5 (uso); `isPiloto` consistente web/móvil; `FIELD_JOBS_WRITE`/`BILLING_WRITE` consistentes entre Task 1 y Task 2.

**Nota de ejecución:** el dashboard móvil del piloto se apoya en el gateo existente por `FINANCIAL_ROLES` (panel operativo, sin 403); no requiere cambios. La visibilidad "solo los suyos" en las listas web/móvil la garantiza el backend (Task 2), por eso no hay filtros extra en el front.
