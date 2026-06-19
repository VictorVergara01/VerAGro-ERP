# Módulo Trabajos de Campo (Fumigación) — Frontend Web — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la UI web de Trabajos de Campo: listar/crear/editar trabajos de fumigación-esparcido, marcarlos hecho, facturarlos, cancelarlos, y una calculadora de mezclas — consumiendo la API `/api/field-jobs/` ya existente.

**Architecture:** Nueva feature `frontend/src/features/field-jobs/` que espeja `features/service-orders/`: `types.ts`, `api.ts` (TanStack Query + openapi-fetch), `FieldJobsPage` (lista+filtros), `FieldJobFormModal` (alta/edición), `FieldJobDetailPage` (detalle+acciones), `SprayMixModal` (calculadora). Más una entrada en el sidebar/rutas y un bloque de precios en Configuración → Empresa. Un cambio menor de backend expone los 4 campos de precio de `CompanyProfile` para poder prellenar el formulario.

**Tech Stack:** React + TypeScript + Vite, Mantine v9 (`@mantine/core`, `@mantine/form`, `@mantine/hooks`, `@mantine/modals`, `@mantine/notifications`), `@tabler/icons-react`, TanStack Query, openapi-fetch, react-router-dom; vitest + @testing-library/react.

## Global Constraints

- Solo frontend web (`frontend/`), salvo el cambio puntual del serializer de empresa en Task 1. No tocar `mobile/`.
- **No usar `@mantine/dates`** (no está instalado). Fechas con `<TextInput type="date">`; rango de fechas con dos `TextInput type="date"` (desde/hasta). Patrón idéntico a `service-orders/ServiceOrderFormModal.tsx`.
- Endpoints (ya existen): `GET/POST /api/field-jobs/`, `GET/PATCH/DELETE /api/field-jobs/{id}/`, `POST .../{id}/mark-done/`, `POST .../{id}/cancel/`, `POST .../{id}/generate-invoice/`, `POST /api/field-jobs/calculate-mix/`. Filtros `?customer= &equipment= &technician= &status= &job_type= &from= &to= &search= &page=`.
- Tipos vienen del schema generado: `Schemas["FieldJob"]` (correr `npm run gen:api` tras Task 1). Campos read-only del backend: `number, status, done_date, total`.
- Tarifas: el `total` lo calcula el servidor; en el form se muestra un total **estimado en vivo** (`hectares×unit_price` o `quintals×unit_price`) solo informativo.
- Permisos UI: escritura visible solo si `canWriteService(user?.role)` (helper existente en `features/auth/roles.ts`); el backend reaplica la regla.
- Comandos (host, desde `frontend/`): tipos `npm run gen:api` (requiere backend en `localhost:8000`); `npm run typecheck`; `npm run lint`; tests `npm run test -- <patrón>`. `npm run lint` tiene ~10 errores PREEXISTENTES en otros archivos — no son de este trabajo; no introducir errores nuevos en los archivos creados.
- Backend en Docker ya levantado; `/api/field-jobs/` responde 200 con login. La BD de dev ya está migrada.

**Spec de referencia:** `docs/superpowers/specs/2026-06-16-modulo-trabajos-campo-nuway-design.md` §5 (frontend web). El backend (plan `...-backend.md`) ya está implementado y en `V2.0`.

---

### Task 1: Backend — exponer precios de empresa + regenerar tipos

**Files:**
- Modify: `backend/apps/core/serializers.py` (`CompanyProfileSerializer.Meta.fields`)
- Modify: `frontend/src/lib/api/schema.d.ts` (regenerado por `npm run gen:api`)
- Test: `backend/apps/core/tests/test_company_defaults.py` (añadir un test de API)

**Interfaces:**
- Produces: el endpoint `/api/company/` ahora incluye `fumigation_price_per_hectare`, `spreading_price_per_quintal`, `drone_tank_volume_liters`, `default_water_per_hectare` (lectura y escritura admin). El schema TS expone `Schemas["FieldJob"]` y los nuevos campos de `CompanyProfile`.

- [ ] **Step 1: Escribir el test de API (falla)**

Añadir a `backend/apps/core/tests/test_company_defaults.py`:

```python
@pytest.mark.django_db
def test_company_api_exposes_field_job_prices():
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    User = get_user_model()
    user = User.objects.create_user(
        email="a@v.com", password="x", full_name="A", role="super_admin"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    resp = c.get("/api/company/")
    assert resp.status_code == 200
    for key in (
        "fumigation_price_per_hectare",
        "spreading_price_per_quintal",
        "drone_tank_volume_liters",
        "default_water_per_hectare",
    ):
        assert key in resp.data
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend pytest apps/core/tests/test_company_defaults.py::test_company_api_exposes_field_job_prices -v`
Expected: FAIL (las claves no están en la respuesta).

- [ ] **Step 3: Ampliar el serializer**

En `backend/apps/core/serializers.py`, añadir los 4 campos a `Meta.fields` (después de `"invoice_footer"`, antes de `"updated_at"`):

```python
        fields = (
            "name",
            "legal_name",
            "tax_id",
            "address",
            "phone",
            "email",
            "whatsapp",
            "logo",
            "invoice_footer",
            "fumigation_price_per_hectare",
            "spreading_price_per_quintal",
            "drone_tank_volume_liters",
            "default_water_per_hectare",
            "updated_at",
        )
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec -T backend pytest apps/core/tests/test_company_defaults.py -v`
Expected: PASS.

- [ ] **Step 5: Reiniciar backend y regenerar los tipos**

Run: `docker compose restart backend` y esperar a que `http://localhost:8000/api/schema/` devuelva 200.
Luego, en `frontend/`: `npm run gen:api`
Verificar: `grep -c "FieldJob" src/lib/api/schema.d.ts` ≥ 1 y `grep -c "fumigation_price_per_hectare" src/lib/api/schema.d.ts` ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/serializers.py backend/apps/core/tests/test_company_defaults.py frontend/src/lib/api/schema.d.ts
git commit -m "feat(core): exponer precios de trabajos de campo en /api/company/ + tipos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `types.ts` + `api.ts` de field-jobs

**Files:**
- Create: `frontend/src/features/field-jobs/types.ts`
- Create: `frontend/src/features/field-jobs/api.ts`

**Interfaces:**
- Consumes: `Schemas["FieldJob"]`, `Paginated`, el cliente `api` (openapi-fetch), `useCustomers`, `useEquipmentList`, `useTechnicians` (existentes).
- Produces:
  - `types.ts`: `FieldJob` type; `JOB_TYPE_OPTIONS/LABEL`, `FJ_STATUS_OPTIONS/LABEL/COLOR`, `RATE_UNIT_OPTIONS`; interfaces `SprayMixProduct`, `SprayMixResult`.
  - `api.ts`: `useFieldJobs(params)`, `useFieldJob(id)`, `useSaveFieldJob()`, `useDeleteFieldJob()`, `useFieldJobAction(id)` (`mark-done`|`cancel`|`generate-invoice`), `useCalculateMix()`.

- [ ] **Step 1: Escribir `types.ts`**

Crear `frontend/src/features/field-jobs/types.ts`:

```ts
import type { Schemas } from "../../lib/api/types";

export type FieldJob = Schemas["FieldJob"];

export const JOB_TYPE_OPTIONS = [
  { value: "fumigation", label: "Fumigación" },
  { value: "spreading", label: "Esparcido / abono" },
];
export const JOB_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  JOB_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export const FJ_STATUS_OPTIONS = [
  { value: "scheduled", label: "Programado" },
  { value: "done", label: "Hecho" },
  { value: "invoiced", label: "Facturado" },
  { value: "cancelled", label: "Cancelado" },
];
export const FJ_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  FJ_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
export const FJ_STATUS_COLOR: Record<string, string> = {
  scheduled: "blue",
  done: "teal",
  invoiced: "grape",
  cancelled: "red",
};

export const RATE_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "mL/ha", label: "mL/ha" },
  { value: "kg/ha", label: "kg/ha" },
  { value: "cc/ha", label: "cc/ha" },
];

export interface SprayMixProduct {
  name: string;
  dose_per_liter: number;
  dose_unit: "mL/L" | "cc/L";
}

export interface SprayMixResultRow {
  name: string;
  quantity: number;
  unit: string;
}

export interface SprayMixResult {
  total_volume_liters: number;
  fills_needed: number;
  full_fills: number;
  last_fill_liters: number;
  per_full_fill: SprayMixResultRow[];
  last_fill: SprayMixResultRow[];
}
```

- [ ] **Step 2: Escribir `api.ts`**

Crear `frontend/src/features/field-jobs/api.ts` (espeja `service-orders/api.ts`):

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { FieldJob, SprayMixProduct, SprayMixResult } from "./types";

export interface FJListParams {
  search?: string;
  status?: string;
  job_type?: string;
  customer?: number;
  from?: string;
  to?: string;
  page?: number;
}

export function useFieldJobs(params: FJListParams) {
  return useQuery({
    queryKey: ["field-jobs", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-jobs/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            job_type: params.job_type || undefined,
            customer: params.customer,
            from: params.from || undefined,
            to: params.to || undefined,
            page: params.page,
          } as unknown as never,
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los trabajos.");
      return data as unknown as Paginated<FieldJob>;
    },
  });
}

export function useFieldJob(id: number | undefined) {
  return useQuery({
    queryKey: ["field-job", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-jobs/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el trabajo.");
      return data as FieldJob;
    },
  });
}

export function useSaveFieldJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FieldJob> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/field-jobs/{id}/", {
          params: { path: { id } },
          body: body as FieldJob,
        });
        if (error) throw new Error("No se pudo guardar el trabajo.");
        return data as FieldJob;
      }
      const { data, error } = await api.POST("/api/field-jobs/", {
        body: body as FieldJob,
      });
      if (error) throw new Error("No se pudo crear el trabajo.");
      return data as FieldJob;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
    },
  });
}

export function useDeleteFieldJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/field-jobs/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el trabajo.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-jobs"] }),
  });
}

type FJAction = "mark-done" | "cancel" | "generate-invoice";

export function useFieldJobAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: FJAction) => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as FieldJob;
      const calls: Record<FJAction, () => ReturnType<typeof api.POST>> = {
        "mark-done": () =>
          api.POST("/api/field-jobs/{id}/mark-done/", { params, body: empty }),
        cancel: () => api.POST("/api/field-jobs/{id}/cancel/", { params, body: empty }),
        "generate-invoice": () =>
          api.POST("/api/field-jobs/{id}/generate-invoice/", { params, body: empty }),
      };
      const { data, error } = await calls[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as { id: number; invoice_number?: string; status?: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-job", id] });
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
    },
  });
}

export interface CalculateMixInput {
  hectares: number;
  water_per_hectare: number;
  tank_volume_liters: number;
  products: SprayMixProduct[];
}

export function useCalculateMix() {
  return useMutation({
    mutationFn: async (input: CalculateMixInput) => {
      const { data, error } = await api.POST("/api/field-jobs/calculate-mix/", {
        body: input as unknown as never,
      });
      if (error || !data) throw new Error("No se pudo calcular la mezcla.");
      return data as unknown as SprayMixResult;
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run (en `frontend/`): `npm run typecheck`
Expected: 0 errores (los tipos `Schemas["FieldJob"]` y los paths existen tras el `gen:api` de Task 1).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/field-jobs/types.ts frontend/src/features/field-jobs/api.ts
git commit -m "feat(field-jobs web): tipos y hooks de API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `SprayMixModal` (calculadora de mezclas)

**Files:**
- Create: `frontend/src/features/field-jobs/SprayMixModal.tsx`
- Test: `frontend/src/features/field-jobs/spray-mix.test.tsx`

**Interfaces:**
- Consumes: `useCalculateMix` (Task 2), `SprayMixResult`.
- Produces: `SprayMixModal({ opened, onClose, prefill? })` — `prefill?: { hectares?; water_per_hectare?; tank_volume_liters? }`.

- [ ] **Step 1: Escribir el test (falla)**

Crear `frontend/src/features/field-jobs/spray-mix.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SprayMixModal } from "./SprayMixModal";

const mutateAsync = vi.fn().mockResolvedValue({
  total_volume_liters: 96, fills_needed: 4, full_fills: 3, last_fill_liters: 6,
  per_full_fill: [{ name: "Glifosato", quantity: 240, unit: "mL" }],
  last_fill: [{ name: "Glifosato", quantity: 48, unit: "mL" }],
});
vi.mock("./api", () => ({ useCalculateMix: () => ({ mutateAsync, isPending: false }) }));

describe("SprayMixModal", () => {
  it("muestra el resultado del cálculo", async () => {
    render(
      <MantineProvider>
        <SprayMixModal opened onClose={() => {}} prefill={{ hectares: 12, water_per_hectare: 8, tank_volume_liters: 30 }} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /calcular/i }));
    expect(await screen.findByText(/4 llenados/i)).toBeInTheDocument();
    expect(await screen.findByText("240 mL")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run (en `frontend/`): `npm run test -- spray-mix`
Expected: FAIL ("Cannot find module './SprayMixModal'").

- [ ] **Step 3: Implementar `SprayMixModal.tsx`**

Crear `frontend/src/features/field-jobs/SprayMixModal.tsx`:

```tsx
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useCalculateMix } from "./api";
import type { SprayMixProduct, SprayMixResult } from "./types";

interface ProductRow {
  name: string;
  dose_per_liter: number | string;
  dose_unit: string;
}

export function SprayMixModal({
  opened,
  onClose,
  prefill,
}: {
  opened: boolean;
  onClose: () => void;
  prefill?: { hectares?: number; water_per_hectare?: number; tank_volume_liters?: number };
}) {
  const calc = useCalculateMix();
  const [hectares, setHectares] = useState<number | string>(prefill?.hectares ?? 0);
  const [water, setWater] = useState<number | string>(prefill?.water_per_hectare ?? 0);
  const [tank, setTank] = useState<number | string>(prefill?.tank_volume_liters ?? 0);
  const [products, setProducts] = useState<ProductRow[]>([
    { name: "", dose_per_liter: 0, dose_unit: "mL/L" },
  ]);
  const [result, setResult] = useState<SprayMixResult | null>(null);

  // Al abrir, sincroniza los valores numéricos desde el prefill del trabajo (el
  // modal queda montado dentro del formulario, así que useState no basta).
  useEffect(() => {
    if (opened && prefill) {
      if (prefill.hectares != null) setHectares(prefill.hectares);
      if (prefill.water_per_hectare != null) setWater(prefill.water_per_hectare);
      if (prefill.tank_volume_liters != null) setTank(prefill.tank_volume_liters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const setProduct = (i: number, patch: Partial<ProductRow>) =>
    setProducts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addProduct = () =>
    setProducts((rows) => [...rows, { name: "", dose_per_liter: 0, dose_unit: "mL/L" }]);
  const removeProduct = (i: number) =>
    setProducts((rows) => rows.filter((_, idx) => idx !== i));

  const run = async () => {
    try {
      const res = await calc.mutateAsync({
        hectares: Number(hectares),
        water_per_hectare: Number(water),
        tank_volume_liters: Number(tank),
        products: products.map((p) => ({
          name: p.name,
          dose_per_liter: Number(p.dose_per_liter),
          dose_unit: p.dose_unit,
        })) as SprayMixProduct[],
      });
      setResult(res);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const copy = () => {
    if (!result) return;
    const lines = [
      `Mezcla: ${result.total_volume_liters} L en ${result.fills_needed} llenados`,
      "Por tanque completo:",
      ...result.per_full_fill.map((r) => `  ${r.name}: ${r.quantity} ${r.unit}`),
    ];
    if (result.last_fill.length) {
      lines.push(`Último llenado (${result.last_fill_liters} L):`);
      lines.push(...result.last_fill.map((r) => `  ${r.name}: ${r.quantity} ${r.unit}`));
    }
    void navigator.clipboard?.writeText(lines.join("\n"));
    notifications.show({ color: "green", message: "Resultado copiado." });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Calculadora de mezcla" size="lg">
      <Stack>
        <Group grow>
          <NumberInput label="Hectáreas" min={0} decimalScale={2} value={hectares} onChange={setHectares} />
          <NumberInput label="Agua/ha (L)" min={0} decimalScale={2} value={water} onChange={setWater} />
          <NumberInput label="Tanque (L)" min={0} decimalScale={2} value={tank} onChange={setTank} />
        </Group>

        <Text fw={600} size="sm">Productos</Text>
        {products.map((p, i) => (
          <Group key={i} wrap="nowrap">
            <TextInput
              placeholder="Nombre"
              value={p.name}
              onChange={(e) => setProduct(i, { name: e.currentTarget.value })}
              style={{ flex: 1 }}
            />
            <NumberInput
              placeholder="Dosis/L"
              min={0}
              decimalScale={2}
              value={p.dose_per_liter}
              onChange={(v) => setProduct(i, { dose_per_liter: v })}
              w={110}
            />
            <Select
              data={["mL/L", "cc/L"]}
              value={p.dose_unit}
              onChange={(v) => setProduct(i, { dose_unit: v ?? "mL/L" })}
              allowDeselect={false}
              w={90}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Quitar producto"
              onClick={() => removeProduct(i)}
              disabled={products.length === 1}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button variant="light" size="xs" leftSection={<IconPlus size={16} />} onClick={addProduct}>
            Agregar producto
          </Button>
          <Button size="xs" onClick={run} loading={calc.isPending}>
            Calcular
          </Button>
        </Group>

        {result && (
          <Stack gap="xs">
            <Text fw={700} c="green">
              Total: {result.total_volume_liters} L en {result.fills_needed} llenados
            </Text>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Por tanque</Table.Th>
                  <Table.Th>Último tanque</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.per_full_fill.map((r, i) => (
                  <Table.Tr key={r.name + i}>
                    <Table.Td>{r.name}</Table.Td>
                    <Table.Td>{r.quantity} {r.unit}</Table.Td>
                    <Table.Td>
                      {result.last_fill[i] ? `${result.last_fill[i].quantity} ${result.last_fill[i].unit}` : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group>
              <Button variant="default" size="xs" onClick={copy}>Copiar resultado</Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run (en `frontend/`): `npm run test -- spray-mix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/SprayMixModal.tsx frontend/src/features/field-jobs/spray-mix.test.tsx
git commit -m "feat(field-jobs web): calculadora de mezclas (SprayMixModal)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `FieldJobFormModal` (alta/edición)

**Files:**
- Create: `frontend/src/features/field-jobs/FieldJobFormModal.tsx`
- Test: `frontend/src/features/field-jobs/field-job-form.test.tsx`

**Interfaces:**
- Consumes: `useSaveFieldJob` (Task 2), `useCustomers`, `useEquipmentList`, `useTechnicians`, `SprayMixModal` (Task 3), `useCompany` (de `features/settings/api.ts`), `JOB_TYPE_OPTIONS`, `RATE_UNIT_OPTIONS`.
- Produces: `FieldJobFormModal({ opened, onClose, job? })`.

- [ ] **Step 1: Escribir el test (falla)**

Crear `frontend/src/features/field-jobs/field-job-form.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldJobFormModal } from "./FieldJobFormModal";

vi.mock("./api", () => ({ useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({
  useCompany: () => ({
    data: { fumigation_price_per_hectare: "20", spreading_price_per_quintal: "10",
      drone_tank_volume_liters: "30", default_water_per_hectare: "8" },
  }),
}));

function renderForm() {
  return render(
    <MantineProvider>
      <FieldJobFormModal opened onClose={() => {}} job={null} />
    </MantineProvider>,
  );
}

describe("FieldJobFormModal", () => {
  it("muestra Hectáreas para fumigación y Quintales al cambiar a esparcido", () => {
    renderForm();
    expect(screen.getByLabelText(/hectáreas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Esparcido / abono"));
    expect(screen.getByLabelText(/quintales/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run (en `frontend/`): `npm run test -- field-job-form`
Expected: FAIL ("Cannot find module './FieldJobFormModal'").

- [ ] **Step 3: Implementar `FieldJobFormModal.tsx`**

Crear `frontend/src/features/field-jobs/FieldJobFormModal.tsx`:

```tsx
import {
  Button,
  Collapse,
  Grid,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useTechnicians } from "../service-orders/api";
import { useCompany } from "../settings/api";
import { useSaveFieldJob } from "./api";
import { SprayMixModal } from "./SprayMixModal";
import { JOB_TYPE_OPTIONS, RATE_UNIT_OPTIONS, type FieldJob } from "./types";

interface FormValues {
  job_type: string;
  customer: string | null;
  equipment: string | null;
  technician: string | null;
  scheduled_date: string;
  location: string;
  crop: string;
  applied_product: string;
  hectares: number | string;
  quintals: number | string;
  unit_price: number | string;
  notes: string;
  application_rate: number | string;
  application_rate_unit: string;
  tank_volume_liters: number | string;
  water_per_hectare: number | string;
  latitude: number | string;
  longitude: number | string;
  wind_speed_kmh: number | string;
  temperature_celsius: number | string;
  humidity_percentage: number | string;
  weather_notes: string;
}

const EMPTY: FormValues = {
  job_type: "fumigation",
  customer: null,
  equipment: null,
  technician: null,
  scheduled_date: "",
  location: "",
  crop: "",
  applied_product: "",
  hectares: 0,
  quintals: 0,
  unit_price: 0,
  notes: "",
  application_rate: "",
  application_rate_unit: "",
  tank_volume_liters: "",
  water_per_hectare: "",
  latitude: "",
  longitude: "",
  wind_speed_kmh: "",
  temperature_celsius: "",
  humidity_percentage: "",
  weather_notes: "",
};

const numOrNull = (v: number | string) => (v === "" || v == null ? null : String(v));

export function FieldJobFormModal({
  opened,
  onClose,
  job,
}: {
  opened: boolean;
  onClose: () => void;
  job?: FieldJob | null;
}) {
  const save = useSaveFieldJob();
  const customers = useCustomers({});
  const equipment = useEquipmentList({});
  const technicians = useTechnicians();
  const company = useCompany();
  const editing = Boolean(job?.id);
  const [appOpen, app] = useDisclosure(false);
  const [weatherOpen, weather] = useDisclosure(false);
  const [gpsOpen, gps] = useDisclosure(false);
  const [mixOpen, mix] = useDisclosure(false);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: { customer: (v) => (v ? null : "Selecciona un cliente.") },
  });

  useEffect(() => {
    if (opened) {
      const c = company.data as Record<string, string> | undefined;
      const defaultPrice =
        (job?.job_type ?? "fumigation") === "spreading"
          ? c?.spreading_price_per_quintal ?? "10"
          : c?.fumigation_price_per_hectare ?? "20";
      form.setValues({
        ...EMPTY,
        unit_price: job?.unit_price ?? defaultPrice,
        tank_volume_liters: c?.drone_tank_volume_liters ?? "",
        water_per_hectare: c?.default_water_per_hectare ?? "",
        ...(job
          ? {
              ...(job as unknown as Partial<FormValues>),
              customer: job.customer ? String(job.customer) : null,
              equipment: job.equipment ? String(job.equipment) : null,
              technician: job.technician ? String(job.technician) : null,
              scheduled_date: job.scheduled_date ?? "",
            }
          : {}),
      } as FormValues);
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, job]);

  const isFumigation = form.values.job_type === "fumigation";
  const liveTotal =
    Number(isFumigation ? form.values.hectares : form.values.quintals || 0) *
    Number(form.values.unit_price || 0);

  const submit = form.onSubmit(async (values) => {
    const payload = {
      id: job?.id,
      job_type: values.job_type,
      customer: Number(values.customer),
      equipment: values.equipment ? Number(values.equipment) : null,
      technician: values.technician ? Number(values.technician) : null,
      scheduled_date: values.scheduled_date || undefined,
      location: values.location,
      crop: values.crop,
      applied_product: values.applied_product,
      hectares: String(values.hectares || 0),
      quintals: String(values.quintals || 0),
      unit_price: String(values.unit_price || 0),
      notes: values.notes,
      application_rate: numOrNull(values.application_rate),
      application_rate_unit: values.application_rate_unit || "",
      tank_volume_liters: numOrNull(values.tank_volume_liters),
      water_per_hectare: numOrNull(values.water_per_hectare),
      latitude: numOrNull(values.latitude),
      longitude: numOrNull(values.longitude),
      wind_speed_kmh: numOrNull(values.wind_speed_kmh),
      temperature_celsius: numOrNull(values.temperature_celsius),
      humidity_percentage: numOrNull(values.humidity_percentage),
      weather_notes: values.weather_notes,
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<FieldJob> & { id?: number });
      notifications.show({ color: "green", message: editing ? "Trabajo actualizado." : "Trabajo creado." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? "Editar trabajo" : "Nuevo trabajo de campo"} size="lg">
      <form onSubmit={submit}>
        <Grid>
          <Grid.Col span={12}>
            <SegmentedControl
              fullWidth
              data={JOB_TYPE_OPTIONS}
              value={form.values.job_type}
              onChange={(v) => form.setFieldValue("job_type", v)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Cliente"
              withAsterisk
              data={(customers.data?.results ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              searchable
              {...form.getInputProps("customer")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Dron"
              placeholder="Sin asignar"
              data={(equipment.data?.results ?? []).map((e) => ({ value: String(e.id), label: e.name }))}
              searchable
              clearable
              {...form.getInputProps("equipment")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Técnico"
              placeholder="Sin asignar"
              data={(technicians.data ?? []).map((t) => ({ value: String(t.id), label: t.full_name }))}
              searchable
              clearable
              {...form.getInputProps("technician")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Fecha programada" type="date" {...form.getInputProps("scheduled_date")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Finca / Ubicación" {...form.getInputProps("location")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Cultivo" {...form.getInputProps("crop")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Producto aplicado" {...form.getInputProps("applied_product")} />
          </Grid.Col>

          {isFumigation ? (
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <NumberInput label="Hectáreas" min={0} decimalScale={4} {...form.getInputProps("hectares")} />
            </Grid.Col>
          ) : (
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <NumberInput label="Quintales" min={0} decimalScale={4} {...form.getInputProps("quintals")} />
            </Grid.Col>
          )}
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label={isFumigation ? "Precio/ha ($)" : "Precio/qq ($)"}
              min={0}
              decimalScale={2}
              {...form.getInputProps("unit_price")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Text size="sm" c="dimmed" mt={28}>Total estimado: <b>{formatCurrency(liveTotal)}</b></Text>
          </Grid.Col>
        </Grid>

        {/* Sección colapsable: aplicación */}
        <Button variant="subtle" size="xs" mt="sm" onClick={app.toggle}>
          {appOpen ? "− " : "+ "}Detalles de aplicación
        </Button>
        <Collapse in={appOpen}>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Tasa de aplicación" min={0} decimalScale={4} {...form.getInputProps("application_rate")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <Select label="Unidad" data={RATE_UNIT_OPTIONS} clearable {...form.getInputProps("application_rate_unit")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Tanque (L)" min={0} decimalScale={2} {...form.getInputProps("tank_volume_liters")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Agua/ha (L)" min={0} decimalScale={2} {...form.getInputProps("water_per_hectare")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Button variant="light" size="xs" onClick={mix.open}>Calcular mezcla</Button>
            </Grid.Col>
          </Grid>
        </Collapse>

        {/* Sección colapsable: clima */}
        <Button variant="subtle" size="xs" mt="xs" onClick={weather.toggle}>
          {weatherOpen ? "− " : "+ "}Condiciones climáticas
        </Button>
        <Collapse in={weatherOpen}>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Viento (km/h)" min={0} decimalScale={1} {...form.getInputProps("wind_speed_kmh")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Temp (°C)" decimalScale={1} {...form.getInputProps("temperature_celsius")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Humedad (%)" min={0} decimalScale={1} {...form.getInputProps("humidity_percentage")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <TextInput label="Condiciones" {...form.getInputProps("weather_notes")} />
            </Grid.Col>
          </Grid>
        </Collapse>

        {/* Sección colapsable: GPS */}
        <Button variant="subtle" size="xs" mt="xs" onClick={gps.toggle}>
          {gpsOpen ? "− " : "+ "}Coordenadas GPS
        </Button>
        <Collapse in={gpsOpen}>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Latitud" decimalScale={6} {...form.getInputProps("latitude")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Longitud" decimalScale={6} {...form.getInputProps("longitude")} />
            </Grid.Col>
          </Grid>
        </Collapse>

        <Textarea label="Notas" autosize minRows={2} mt="sm" {...form.getInputProps("notes")} />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Guardar</Button>
        </Group>
      </form>

      <SprayMixModal
        opened={mixOpen}
        onClose={mix.close}
        prefill={{
          hectares: Number(form.values.hectares) || undefined,
          water_per_hectare: Number(form.values.water_per_hectare) || undefined,
          tank_volume_liters: Number(form.values.tank_volume_liters) || undefined,
        }}
      />
    </Modal>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run (en `frontend/`): `npm run test -- field-job-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobFormModal.tsx frontend/src/features/field-jobs/field-job-form.test.tsx
git commit -m "feat(field-jobs web): formulario de alta/edicion con calculadora

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `FieldJobsPage` (lista) + ruta + sidebar

**Files:**
- Create: `frontend/src/features/field-jobs/FieldJobsPage.tsx`
- Modify: `frontend/src/routes/AppRoutes.tsx`
- Modify: `frontend/src/components/layout/navItems.ts`
- Test: `frontend/src/features/field-jobs/field-jobs-page.test.tsx`

**Interfaces:**
- Consumes: `useFieldJobs` (Task 2), `FieldJobFormModal` (Task 4), `JOB_TYPE_*`/`FJ_STATUS_*`, `canWriteService`, `useAuth`, `PAGE_SIZE`, `formatCurrency`, `formatDate`.
- Produces: ruta `/field-jobs`; entrada de sidebar "Trabajos de campo".

- [ ] **Step 1: Escribir el test (falla)**

Crear `frontend/src/features/field-jobs/field-jobs-page.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FieldJobsPage } from "./FieldJobsPage";

const mockList = vi.fn();
vi.mock("./api", () => ({ useFieldJobs: () => mockList(), useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({ useCompany: () => ({ data: {} }) }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "super_admin" } }) }));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <FieldJobsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("FieldJobsPage", () => {
  it("muestra los trabajos con número, finca y total", () => {
    mockList.mockReturnValue({
      data: {
        count: 1, next: null, previous: null,
        results: [{
          id: 1, number: "TC-000001", job_type: "fumigation", job_type_display: "Fumigación",
          status: "scheduled", status_display: "Programado", customer_name: "Finca La Esperanza",
          location: "Lote 3", scheduled_date: "2026-06-18", hectares: "12.5000", quintals: "0.0000",
          total: "250.00",
        }],
      },
      isLoading: false, error: null,
    });
    renderPage();
    expect(screen.getByText("TC-000001")).toBeInTheDocument();
    expect(screen.getByText("Finca La Esperanza")).toBeInTheDocument();
    expect(screen.getByText("$250.00")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run (en `frontend/`): `npm run test -- field-jobs-page`
Expected: FAIL ("Cannot find module './FieldJobsPage'").

- [ ] **Step 3: Implementar `FieldJobsPage.tsx`**

Crear `frontend/src/features/field-jobs/FieldJobsPage.tsx`:

```tsx
import { Alert, Badge, Button, Group, Pagination, Select, Stack, TextInput } from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { formatCurrency, formatDate } from "../../utils/format";
import { canWriteService } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { useFieldJobs } from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  FJ_STATUS_OPTIONS,
  JOB_TYPE_LABEL,
  JOB_TYPE_OPTIONS,
  type FieldJob,
} from "./types";

export function FieldJobsPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [jobType, setJobType] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading, error } = useFieldJobs({
    search: debounced,
    status: status || undefined,
    job_type: jobType || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
  });

  const columns: Column<FieldJob>[] = [
    { header: "N.º", render: (j) => j.number },
    { header: "Tipo", render: (j) => <Badge variant="light">{JOB_TYPE_LABEL[j.job_type ?? "fumigation"]}</Badge> },
    { header: "Cliente", render: (j) => j.customer_name ?? "—" },
    { header: "Finca", render: (j) => j.location || "—" },
    { header: "Programado", render: (j) => formatDate(j.scheduled_date) },
    {
      header: "Ha/Qq",
      align: "right",
      render: (j) => (j.job_type === "spreading" ? `${j.quintals} qq` : `${j.hectares} ha`),
    },
    { header: "Total", align: "right", render: (j) => formatCurrency(j.total) },
    {
      header: "Estado",
      render: (j) => (
        <Badge color={FJ_STATUS_COLOR[j.status ?? "scheduled"]} variant="light">
          {FJ_STATUS_LABEL[j.status ?? "scheduled"]}
        </Badge>
      ),
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const resetPage = () => setPage(1);

  return (
    <Stack>
      <PageHeader
        title="Trabajos de campo"
        subtitle="Fumigación y esparcido con drones."
        action={
          canWriteService(user?.role) ? (
            <Button leftSection={<IconPlus size={18} />} onClick={open}>Nuevo trabajo</Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert color="red">No se pudieron cargar los trabajos.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(j) => j.id}
          emptyText="No hay trabajos de campo."
          onRowClick={(j) => navigate(`/field-jobs/${j.id}`)}
          toolbar={
            <Group>
              <TextInput
                placeholder="Buscar por número, finca o cliente"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => { setSearch(e.currentTarget.value); resetPage(); }}
                w={300}
              />
              <Select placeholder="Tipo" data={JOB_TYPE_OPTIONS} value={jobType}
                onChange={(v) => { setJobType(v); resetPage(); }} clearable w={170} />
              <Select placeholder="Estado" data={FJ_STATUS_OPTIONS} value={status}
                onChange={(v) => { setStatus(v); resetPage(); }} clearable w={160} />
              <TextInput type="date" aria-label="Desde" value={from}
                onChange={(e) => { setFrom(e.currentTarget.value); resetPage(); }} />
              <TextInput type="date" aria-label="Hasta" value={to}
                onChange={(e) => { setTo(e.currentTarget.value); resetPage(); }} />
            </Group>
          }
          footer={
            totalPages > 1 ? (
              <Group justify="flex-end">
                <Pagination value={page} onChange={setPage} total={totalPages} />
              </Group>
            ) : undefined
          }
        />
      )}

      <FieldJobFormModal opened={formOpen} onClose={close} job={null} />
    </Stack>
  );
}
```

- [ ] **Step 4: Registrar la ruta**

En `frontend/src/routes/AppRoutes.tsx`: añadir el import junto a los demás —
```tsx
import { FieldJobsPage } from "../features/field-jobs/FieldJobsPage";
import { FieldJobDetailPage } from "../features/field-jobs/FieldJobDetailPage";
```
y dentro del `<Route element={<AppLayout />}>`, tras las rutas de `service-orders`:
```tsx
          <Route path="/field-jobs" element={<FieldJobsPage />} />
          <Route path="/field-jobs/:id" element={<FieldJobDetailPage />} />
```
(La página de detalle se crea en Task 6; el import quedará en rojo hasta entonces — por eso el typecheck completo se corre al final de Task 6. Si prefieres mantener verde entre tareas, agrega solo la ruta de lista ahora y la de detalle en Task 6.)

- [ ] **Step 5: Añadir la entrada al sidebar**

En `frontend/src/components/layout/navItems.ts`: añadir `IconDrone` al import de `@tabler/icons-react`, y dentro del grupo "Menú", tras "Órdenes de servicio":
```ts
      { label: "Trabajos de campo", to: "/field-jobs", icon: IconDrone },
```

- [ ] **Step 6: Correr el test de la lista y verificar que pasa**

Run (en `frontend/`): `npm run test -- field-jobs-page`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobsPage.tsx frontend/src/features/field-jobs/field-jobs-page.test.tsx frontend/src/routes/AppRoutes.tsx frontend/src/components/layout/navItems.ts
git commit -m "feat(field-jobs web): pagina de lista, ruta y entrada de sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `FieldJobDetailPage` (detalle + acciones)

**Files:**
- Create: `frontend/src/features/field-jobs/FieldJobDetailPage.tsx`
- Test: `frontend/src/features/field-jobs/field-job-detail.test.tsx`

**Interfaces:**
- Consumes: `useFieldJob`, `useFieldJobAction` (Task 2), `FieldJobFormModal` (Task 4), `DetailHeader`, `Field`, `formatCurrency`/`formatDate`, `FJ_STATUS_*`, `JOB_TYPE_LABEL`.
- Produces: nada nuevo (cierra el typecheck del import en AppRoutes de Task 5).

- [ ] **Step 1: Escribir el test (falla)**

Crear `frontend/src/features/field-jobs/field-job-detail.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FieldJobDetailPage } from "./FieldJobDetailPage";

const job = {
  id: 1, number: "TC-000001", job_type: "fumigation", job_type_display: "Fumigación",
  status: "scheduled", status_display: "Programado", customer_name: "Finca La Esperanza",
  location: "Lote 3", crop: "Arroz", scheduled_date: "2026-06-18",
  hectares: "12.5000", quintals: "0.0000", unit_price: "20.00", total: "250.00",
};
vi.mock("./api", () => ({
  useFieldJob: () => ({ data: job, isLoading: false, error: null }),
  useFieldJobAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({ useCompany: () => ({ data: {} }) }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "super_admin" } }) }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "1" }),
}));

describe("FieldJobDetailPage", () => {
  it("muestra el trabajo y el botón Marcar hecho en estado programado", () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <FieldJobDetailPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByText("TC-000001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar hecho/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run (en `frontend/`): `npm run test -- field-job-detail`
Expected: FAIL ("Cannot find module './FieldJobDetailPage'").

- [ ] **Step 3: Implementar `FieldJobDetailPage.tsx`**

Crear `frontend/src/features/field-jobs/FieldJobDetailPage.tsx`:

```tsx
import { Alert, Anchor, Badge, Button, Card, Grid, Group, Loader, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit } from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router-dom";

import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import { useFieldJob, useFieldJobAction } from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";
import { FJ_STATUS_COLOR, FJ_STATUS_LABEL, JOB_TYPE_LABEL } from "./types";

export function FieldJobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const jobId = id ? Number(id) : undefined;
  const { data: job, isLoading, error } = useFieldJob(jobId);
  const action = useFieldJobAction(jobId);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !job) return <Alert color="red">No se pudo cargar el trabajo.</Alert>;

  const status = job.status ?? "scheduled";
  const isFumigation = job.job_type === "fumigation";

  const act = async (a: "mark-done" | "cancel" | "generate-invoice", ok: string) => {
    try {
      const res = await action.mutateAsync(a);
      notifications.show({
        color: "green",
        message: a === "generate-invoice" ? `Factura ${res.invoice_number} generada.` : ok,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmCancel = () =>
    modals.openConfirmModal({
      title: "Cancelar trabajo",
      children: "¿Cancelar este trabajo de campo?",
      labels: { confirm: "Cancelar trabajo", cancel: "Volver" },
      confirmProps: { color: "red" },
      onConfirm: () => act("cancel", "Trabajo cancelado."),
    });

  const hasGps = job.latitude != null && job.longitude != null;

  return (
    <Stack>
      <DetailHeader
        backTo="/field-jobs"
        backLabel="Trabajos de campo"
        title={job.number}
        badge={
          <Badge color={FJ_STATUS_COLOR[status]} variant="light" size="lg">
            {FJ_STATUS_LABEL[status]}
          </Badge>
        }
        actions={
          <>
            {status === "scheduled" && (
              <>
                <Button variant="default" leftSection={<IconEdit size={18} />} onClick={openEdit}>Editar</Button>
                <Button color="teal" onClick={() => act("mark-done", "Marcado como hecho.")}>Marcar hecho</Button>
                <Button variant="light" color="red" onClick={confirmCancel}>Cancelar</Button>
              </>
            )}
            {status === "done" && (
              <>
                <Button color="green" onClick={() => act("generate-invoice", "Factura generada.")}>Facturar</Button>
                <Button variant="light" color="red" onClick={confirmCancel}>Cancelar</Button>
              </>
            )}
          </>
        }
      />

      <Card>
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cliente" value={job.customer_name} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Dron" value={job.equipment_name || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Técnico" value={job.technician_name || "Sin asignar"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tipo" value={JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Finca" value={job.location || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cultivo" value={job.crop || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Producto" value={job.applied_product || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Programado" value={formatDate(job.scheduled_date)} /></Grid.Col>
          {job.done_date && (
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Hecho" value={formatDate(job.done_date)} /></Grid.Col>
          )}
        </Grid>
      </Card>

      <Group justify="flex-end">
        <Card withBorder radius="md" w={320}>
          <Stack gap={4}>
            <Group justify="space-between">
              <Text c="dimmed">{isFumigation ? "Hectáreas" : "Quintales"}</Text>
              <Text>{isFumigation ? job.hectares : job.quintals}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Precio/{isFumigation ? "ha" : "qq"}</Text>
              <Text>{formatCurrency(job.unit_price)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(job.total)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      {(job.application_rate != null || job.tank_volume_liters != null) && (
        <Card><Text fw={600} mb="xs">Aplicación</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tasa" value={`${job.application_rate ?? "—"} ${job.application_rate_unit_display ?? ""}`} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tanque (L)" value={job.tank_volume_liters ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Agua/ha (L)" value={job.water_per_hectare ?? "—"} /></Grid.Col>
          </Grid>
        </Card>
      )}

      {(job.wind_speed_kmh != null || job.weather_notes) && (
        <Card><Text fw={600} mb="xs">Clima</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Viento (km/h)" value={job.wind_speed_kmh ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Temp (°C)" value={job.temperature_celsius ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Humedad (%)" value={job.humidity_percentage ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Condiciones" value={job.weather_notes || "—"} /></Grid.Col>
          </Grid>
        </Card>
      )}

      {hasGps && (
        <Card><Text fw={600} mb="xs">Coordenadas</Text>
          <Anchor href={`https://www.google.com/maps?q=${job.latitude},${job.longitude}`} target="_blank">
            {job.latitude}, {job.longitude} — abrir en Google Maps
          </Anchor>
        </Card>
      )}

      {job.notes && (
        <Card><Field label="Notas" value={job.notes} /></Card>
      )}

      <FieldJobFormModal opened={editOpen} onClose={closeEdit} job={job} />
    </Stack>
  );
}
```

- [ ] **Step 4: Correr el test, typecheck, lint y suite de field-jobs**

Run (en `frontend/`):
`npm run test -- field-job-detail field-jobs-page field-job-form spray-mix && npm run typecheck`
Expected: tests PASS; typecheck 0 errores (ahora que existe `FieldJobDetailPage`, el import en `AppRoutes` resuelve).
Verificar lint local de los archivos nuevos: `npm run lint 2>&1 | grep -i "field-jobs" || echo "sin errores de lint en field-jobs"`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobDetailPage.tsx frontend/src/features/field-jobs/field-job-detail.test.tsx
git commit -m "feat(field-jobs web): pagina de detalle con acciones y secciones condicionales

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Bloque de precios en Configuración → Empresa

**Files:**
- Modify: `frontend/src/features/settings/api.ts` (`CompanyInput`, `CompanyProfile` type ya viene del schema; el `useSaveCompany` ya envía todo el form como multipart)
- Modify: `frontend/src/features/settings/CompanySettings.tsx` (añadir 4 campos)
- Test: `frontend/src/features/settings/settings.test.tsx` (no requiere cambio; opcional)

**Interfaces:**
- Consumes: `useCompany`/`useSaveCompany` (ya exponen los 4 campos tras Task 1).
- Produces: UI para editar `fumigation_price_per_hectare`, `spreading_price_per_quintal`, `drone_tank_volume_liters`, `default_water_per_hectare`.

- [ ] **Step 1: Extender `CompanyInput` y el estado del form**

En `frontend/src/features/settings/api.ts`, añadir a la interface `CompanyInput` los 4 campos opcionales (string, porque la API los serializa como decimales-string):

```ts
  fumigation_price_per_hectare?: string;
  spreading_price_per_quintal?: string;
  drone_tank_volume_liters?: string;
  default_water_per_hectare?: string;
```

(El `useSaveCompany` ya itera `Object.entries(input)` y los envía; no requiere más cambios.)

- [ ] **Step 2: Añadir los campos al formulario**

En `frontend/src/features/settings/CompanySettings.tsx`:
1. En el `initialValues`/`form.setValues` de la empresa, incluir los 4 campos leyendo de `data` (p. ej. `fumigation_price_per_hectare: data.fumigation_price_per_hectare ?? "20"`, etc., siguiendo el patrón de los demás campos del archivo).
2. Tras el bloque de campos existente (antes del botón Guardar), añadir una sección:

```tsx
        <Text fw={600} mt="md">Trabajos de campo</Text>
        <Group grow>
          <TextInput label="Precio fumigación ($/ha)" disabled={!isAdmin} {...form.getInputProps("fumigation_price_per_hectare")} />
          <TextInput label="Precio esparcido ($/qq)" disabled={!isAdmin} {...form.getInputProps("spreading_price_per_quintal")} />
        </Group>
        <Group grow>
          <TextInput label="Tanque del dron (L)" disabled={!isAdmin} {...form.getInputProps("drone_tank_volume_liters")} />
          <TextInput label="Agua de carga (L/ha)" disabled={!isAdmin} {...form.getInputProps("default_water_per_hectare")} />
        </Group>
```

(Si `Text`/`Group` no están importados en el archivo, añádelos al import de `@mantine/core`. Los 4 son texto numérico simple; mantener `TextInput` por consistencia con el resto del form de empresa.)

- [ ] **Step 3: Typecheck, lint y tests de settings**

Run (en `frontend/`): `npm run typecheck && npm run test -- settings`
Expected: typecheck 0 errores; tests de settings PASS (el `LookupManager`/`CompanySettings` no rompe).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/settings/api.ts frontend/src/features/settings/CompanySettings.tsx
git commit -m "feat(settings web): precios base de trabajos de campo en Configuracion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 (backend+tipos) → 2 (types+api) → 3 (SprayMixModal) → 4 (FormModal) → 5 (ListPage+ruta+nav) → 6 (DetailPage) → 7 (settings). El typecheck completo cierra en Task 6 (cuando existe `FieldJobDetailPage` referida por `AppRoutes`).
- **`npm run gen:api`** (Task 1) requiere el backend reiniciado con el serializer nuevo. Sin eso, `Schemas["FieldJob"]` y los campos de empresa no existen en los tipos.
- **Lint:** el repo arrastra ~10 errores preexistentes en otros archivos; no son de este trabajo. Solo asegurar que los archivos nuevos de `field-jobs` queden sin errores de lint.
- **Verificación manual al final:** en `localhost:5173`, entrar (dev@veragro.com / dev12345) → "Trabajos de campo" en el sidebar → crear, marcar hecho, facturar, y probar la calculadora.
- **Fuera de alcance (plan posterior):** app móvil (pestaña Campo, GPS con expo-location, calculadora móvil), exportación MIDA, persistir mezcla, descuento de inventario.
