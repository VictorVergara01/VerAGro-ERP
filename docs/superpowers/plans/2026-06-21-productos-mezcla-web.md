# Productos y calculadora de mezcla — Frontend Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI web para cargar una lista de productos (dosis/ha, líquido o granulado) en el trabajo de campo y una calculadora de mezcla que muestre químico líquido vs agua por tanque.

**Architecture:** Actualiza `features/field-jobs/`: `types.ts`/`api.ts` al nuevo contrato del backend (productos con dosis/ha; `calculate_mix` por tasa de aplicación), reescribe `SprayMixModal` al nuevo desglose, agrega una **lista dinámica de productos** al `FieldJobFormModal` (reemplaza el campo único "Producto aplicado") y un card de productos en `FieldJobDetailPage`.

**Tech Stack:** React + TypeScript, Mantine v9 (`@mantine/core`, `@mantine/form`, `@mantine/hooks`), `@tabler/icons-react`, TanStack Query, openapi-fetch; vitest.

## Global Constraints

- Solo `frontend/`. El backend ya expone `products` en `FieldJob`, `calculate-mix` con el nuevo cuerpo, y el default de tanque 200.
- Unidades de producto: **`L/ha`, `cc/ha`** (líquidos) y **`kg/ha`, `g/ha`** (granulados). NO `mL/ha`.
- El **caldo/ha** se etiqueta en la UI como **"Tasa de aplicación (L/ha)"** (mapea al campo `water_per_hectare`; el endpoint lo recibe como `caldo_per_hectare`).
- Tanque (`tank_volume_liters`) prefill **200** (del `CompanyProfile`).
- Agua = caldo − químico líquido (lo calcula el backend); los granulados van aparte.
- Se elimina del form el campo único "Producto aplicado" (queda legacy en backend) y los campos sueltos `application_rate`/`application_rate_unit` (superados por la lista de productos + la tasa).
- Comandos en el HOST desde `frontend/`: `npm run gen:api` (backend en `localhost:8000`), `npm run typecheck`, `npm run test -- <patrón>`. `npm run lint` tiene errores PREEXISTENTES en otros archivos; no introducir nuevos en los archivos tocados.

**Spec de referencia:** `docs/superpowers/specs/2026-06-21-productos-mezcla-trabajos-campo-design.md` (aprobado). Backend ya implementado y en `V2.0`.

---

### Task 1: Contratos — `gen:api` + `types.ts` + `api.ts`

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts` (regenerado)
- Modify: `frontend/src/features/field-jobs/types.ts`
- Modify: `frontend/src/features/field-jobs/api.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `PRODUCT_UNIT_OPTIONS` (L/ha, cc/ha, kg/ha, g/ha); `SprayMixProduct = {name; dose_per_hectare; unit}`; `SprayMixResultRow = {name; quantity; unit}`; `SprayMixResult` (nuevo: total_caldo_liters, liquid_chemical_liters, water_liters, tanks_needed, full_tanks, last_tank_liters, products_total, per_full_tank, water_per_full_tank, last_tank, water_last_tank); `SprayMixPrefill = {hectares?; caldo_per_hectare?; tank_volume_liters?; products?: SprayMixProduct[]}`. (Quitar `RATE_UNIT_OPTIONS` y el viejo `SprayMixProduct`/`SprayMixResult`.)
  - `api.ts`: `CalculateMixInput = {hectares; caldo_per_hectare; tank_volume_liters; products: SprayMixProduct[]}`; `useCalculateMix` devuelve el nuevo `SprayMixResult`.

- [ ] **Step 1: Regenerar el schema**

Con el backend arriba, en `frontend/`: `npm run gen:api`.
Verificar: `grep -c "FieldJobProduct" src/lib/api/schema.d.ts` ≥ 1 (el `FieldJob` ahora tiene `products`).

- [ ] **Step 2: Reescribir los tipos en `types.ts`**

Reemplazar `RATE_UNIT_OPTIONS`, `SprayMixProduct`, `SprayMixResult` por:

```ts
export const PRODUCT_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "cc/ha", label: "cc/ha" },
  { value: "kg/ha", label: "kg/ha" },
  { value: "g/ha", label: "g/ha" },
];

export interface SprayMixProduct {
  name: string;
  dose_per_hectare: number;
  unit: string;
}

export interface SprayMixResultRow {
  name: string;
  quantity: number;
  unit: string;
}

export interface SprayMixResult {
  total_caldo_liters: number;
  liquid_chemical_liters: number;
  water_liters: number;
  tanks_needed: number;
  full_tanks: number;
  last_tank_liters: number;
  products_total: SprayMixResultRow[];
  per_full_tank: SprayMixResultRow[];
  water_per_full_tank: number;
  last_tank: SprayMixResultRow[];
  water_last_tank: number;
}

export interface SprayMixPrefill {
  hectares?: number;
  caldo_per_hectare?: number;
  tank_volume_liters?: number;
  products?: SprayMixProduct[];
}
```

(Conservar `FieldJob`, `JOB_TYPE_*`, `FJ_STATUS_*` sin cambios.)

- [ ] **Step 3: Actualizar `api.ts`**

Reemplazar `CalculateMixInput` y `useCalculateMix` por:

```ts
export interface CalculateMixInput {
  hectares: number;
  caldo_per_hectare: number;
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

(El import de tipos de `./types` debe incluir `SprayMixProduct, SprayMixResult`.)

- [ ] **Step 4: Typecheck**

Run (en `frontend/`): `npm run typecheck`
Expected: fallará en `SprayMixModal.tsx` y `FieldJobFormModal.tsx` (usan los tipos viejos) — eso es esperado; se arreglan en Tasks 2-3. Para aislar, verificar que `types.ts` y `api.ts` no tienen errores propios revisando que los errores reportados sean solo de esos dos componentes. (El typecheck del proyecto queda verde al cerrar Task 3.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/schema.d.ts frontend/src/features/field-jobs/types.ts frontend/src/features/field-jobs/api.ts
git commit -m "feat(field-jobs web): contratos de productos y calculadora por dosis/ha

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Nota: este task deja el typecheck del proyecto en rojo a propósito (los consumidores se actualizan en Tasks 2-3). El gate verde se valida al final de Task 3.

---

### Task 2: Reescribir `SprayMixModal`

**Files:**
- Modify (reescribir): `frontend/src/features/field-jobs/SprayMixModal.tsx`
- Modify: `frontend/src/features/field-jobs/spray-mix.test.tsx`

**Interfaces:**
- Consumes: `useCalculateMix` (Task 1), `SprayMixResult`, `SprayMixPrefill`, `PRODUCT_UNIT_OPTIONS`.
- Produces: `SprayMixModal({ opened, onClose, prefill? })` con `prefill?: SprayMixPrefill`.

- [ ] **Step 1: Reescribir el componente**

Reemplazar todo `frontend/src/features/field-jobs/SprayMixModal.tsx` por:

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
import { PRODUCT_UNIT_OPTIONS, type SprayMixPrefill, type SprayMixResult } from "./types";

interface ProductRow {
  name: string;
  dose_per_hectare: number | string;
  unit: string;
}

const emptyRow = (): ProductRow => ({ name: "", dose_per_hectare: 0, unit: "L/ha" });

export function SprayMixModal({
  opened,
  onClose,
  prefill,
}: {
  opened: boolean;
  onClose: () => void;
  prefill?: SprayMixPrefill;
}) {
  const calc = useCalculateMix();
  const [hectares, setHectares] = useState<number | string>(0);
  const [caldo, setCaldo] = useState<number | string>(0);
  const [tank, setTank] = useState<number | string>(200);
  const [rows, setRows] = useState<ProductRow[]>([emptyRow()]);
  const [result, setResult] = useState<SprayMixResult | null>(null);

  useEffect(() => {
    if (opened) {
      setHectares(prefill?.hectares ?? 0);
      setCaldo(prefill?.caldo_per_hectare ?? 0);
      setTank(prefill?.tank_volume_liters ?? 200);
      const seeded = (prefill?.products ?? []).filter((p) => p.name);
      setRows(
        seeded.length
          ? seeded.map((p) => ({ name: p.name, dose_per_hectare: p.dose_per_hectare, unit: p.unit }))
          : [emptyRow()],
      );
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const setRow = (i: number, patch: Partial<ProductRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const run = async () => {
    setResult(null);
    try {
      const res = await calc.mutateAsync({
        hectares: Number(hectares),
        caldo_per_hectare: Number(caldo),
        tank_volume_liters: Number(tank),
        products: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), dose_per_hectare: Number(r.dose_per_hectare), unit: r.unit })),
      });
      setResult(res);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Calculadora de mezcla" size="lg">
      <Stack>
        <Group grow>
          <NumberInput label="Hectáreas" min={0} decimalScale={4} value={hectares} onChange={setHectares} />
          <NumberInput label="Tasa de aplicación (L/ha)" min={0} decimalScale={2} value={caldo} onChange={setCaldo} />
          <NumberInput label="Tanque (L)" min={0} decimalScale={2} value={tank} onChange={setTank} />
        </Group>

        <Text fw={600} size="sm">Productos (dosis por hectárea)</Text>
        {rows.map((r, i) => (
          <Group key={i} wrap="nowrap">
            <TextInput
              placeholder="Producto"
              value={r.name}
              onChange={(e) => setRow(i, { name: e.currentTarget.value })}
              style={{ flex: 1 }}
            />
            <NumberInput
              placeholder="Dosis/ha"
              min={0}
              decimalScale={4}
              value={r.dose_per_hectare}
              onChange={(v) => setRow(i, { dose_per_hectare: v })}
              w={120}
            />
            <Select
              data={PRODUCT_UNIT_OPTIONS}
              value={r.unit}
              onChange={(v) => setRow(i, { unit: v ?? "L/ha" })}
              allowDeselect={false}
              w={100}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Quitar producto"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button variant="light" size="xs" leftSection={<IconPlus size={16} />} onClick={addRow}>
            Agregar producto
          </Button>
          <Button size="xs" onClick={run} loading={calc.isPending}>Calcular</Button>
        </Group>

        {result && (
          <Stack gap="xs">
            <Text fw={700} c="green">
              Caldo total: {result.total_caldo_liters} L · {result.tanks_needed} tanque(s) ·
              químico líquido {result.liquid_chemical_liters} L · agua {result.water_liters} L
            </Text>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Por tanque lleno</Table.Th>
                  <Table.Th>Último tanque</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.products_total.map((p, i) => (
                  <Table.Tr key={p.name + i}>
                    <Table.Td>{p.name}</Table.Td>
                    <Table.Td>{p.quantity} {p.unit}</Table.Td>
                    <Table.Td>
                      {result.per_full_tank[i] ? `${result.per_full_tank[i].quantity} ${result.per_full_tank[i].unit}` : "—"}
                    </Table.Td>
                    <Table.Td>
                      {result.last_tank[i] ? `${result.last_tank[i].quantity} ${result.last_tank[i].unit}` : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td fw={700}>Agua</Table.Td>
                  <Table.Td fw={700}>{result.water_liters} L</Table.Td>
                  <Table.Td>{result.full_tanks > 0 ? `${result.water_per_full_tank} L` : "—"}</Table.Td>
                  <Table.Td>{result.last_tank_liters > 0 ? `${result.water_last_tank} L` : "—"}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            {result.full_tanks > 0 && (
              <Text size="sm" c="dimmed">
                {result.full_tanks} tanque(s) lleno(s) de {tank} L
                {result.last_tank_liters > 0 ? ` + 1 parcial de ${result.last_tank_liters} L` : ""}.
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 2: Reescribir el test**

Reemplazar `frontend/src/features/field-jobs/spray-mix.test.tsx` por:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SprayMixModal } from "./SprayMixModal";

const mutateAsync = vi.fn().mockResolvedValue({
  total_caldo_liters: 400, liquid_chemical_liters: 75, water_liters: 325,
  tanks_needed: 2, full_tanks: 2, last_tank_liters: 0,
  products_total: [{ name: "Glifosato", quantity: 75, unit: "L" }],
  per_full_tank: [{ name: "Glifosato", quantity: 37.5, unit: "L" }],
  water_per_full_tank: 162.5,
  last_tank: [],
  water_last_tank: 0,
});
vi.mock("./api", () => ({ useCalculateMix: () => ({ mutateAsync, isPending: false }) }));

describe("SprayMixModal", () => {
  it("muestra el desglose de la mezcla", async () => {
    render(
      <MantineProvider>
        <SprayMixModal
          opened
          onClose={() => {}}
          prefill={{ hectares: 50, caldo_per_hectare: 8, tank_volume_liters: 200,
            products: [{ name: "Glifosato", dose_per_hectare: 1.5, unit: "L/ha" }] }}
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /calcular/i }));
    expect(await screen.findByText(/2 tanque/i)).toBeInTheDocument();
    expect(await screen.findByText("37.5 L")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Correr el test**

Run (en `frontend/`): `npm run test -- spray-mix`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/field-jobs/SprayMixModal.tsx frontend/src/features/field-jobs/spray-mix.test.tsx
git commit -m "feat(field-jobs web): calculadora de mezcla por dosis/ha (liquido/agua/granulado por tanque)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Lista de productos en `FieldJobFormModal`

**Files:**
- Modify: `frontend/src/features/field-jobs/FieldJobFormModal.tsx`
- Test: `frontend/src/features/field-jobs/field-job-form.test.tsx` (extender)

**Interfaces:**
- Consumes: `SprayMixModal` (Task 2), `PRODUCT_UNIT_OPTIONS`, `useSaveFieldJob`, `useCompany`, `SprayMixPrefill`.
- Produces: el form crea/edita el `FieldJob` con `products`.

- [ ] **Step 1: FormValues + EMPTY + imports**

En `frontend/src/features/field-jobs/FieldJobFormModal.tsx`:
1. Imports: añadir `ActionIcon`, `Table` (si hace falta para filas, opcional), `IconPlus`, `IconTrash` de `@tabler/icons-react`; reemplazar el import `RATE_UNIT_OPTIONS` por `PRODUCT_UNIT_OPTIONS` y añadir `type SprayMixProduct` desde `./types`.
2. En `interface FormValues`, **quitar** `applied_product`, `application_rate`, `application_rate_unit`, y **añadir**:

```ts
  products: { name: string; dose_per_hectare: number | string; unit: string }[];
```

3. En `EMPTY`, quitar `applied_product/application_rate/application_rate_unit` y añadir `products: []`.

- [ ] **Step 2: Sembrar productos al abrir**

En el `useEffect` de apertura, dentro del spread de `job`, mapear los productos del trabajo. Tras la línea `scheduled_date: job.scheduled_date ?? "",` (dentro del objeto `...(job ? {...} : {})`), añadir:

```ts
              products: (job.products ?? []).map((p) => ({
                name: p.name,
                dose_per_hectare: p.dose_per_hectare ?? "",
                unit: p.unit,
              })),
```

(El `FieldJob` del schema ahora incluye `products`.)

- [ ] **Step 3: Submit con products**

En `submit`, en el objeto `payload`: quitar `applied_product`, `application_rate`, `application_rate_unit` y añadir:

```ts
      products: values.products
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dose_per_hectare: String(p.dose_per_hectare || 0), unit: p.unit })),
```

- [ ] **Step 4: UI de la lista de productos (reemplaza "Producto aplicado")**

Reemplazar el `<Grid.Col>` del `TextInput label="Producto aplicado"` por nada (quitarlo), y **antes** del `<Grid>` de cantidad/precio o tras Cultivo, añadir (fuera del `<Grid>`, como bloque propio) la lista de productos:

```tsx
        <Text fw={600} size="sm" mt="sm">Productos a aplicar</Text>
        {form.values.products.map((p, i) => (
          <Group key={i} wrap="nowrap" mt={4}>
            <TextInput
              placeholder="Producto / medicamento"
              value={p.name}
              onChange={(e) =>
                form.setFieldValue(`products.${i}.name`, e.currentTarget.value)
              }
              style={{ flex: 1 }}
            />
            <NumberInput
              placeholder="Dosis/ha"
              min={0}
              decimalScale={4}
              value={p.dose_per_hectare}
              onChange={(v) => form.setFieldValue(`products.${i}.dose_per_hectare`, v)}
              w={120}
            />
            <Select
              data={PRODUCT_UNIT_OPTIONS}
              value={p.unit}
              onChange={(v) => form.setFieldValue(`products.${i}.unit`, v ?? "L/ha")}
              allowDeselect={false}
              w={100}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Quitar producto"
              onClick={() => form.removeListItem("products", i)}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="light"
          size="xs"
          mt={4}
          leftSection={<IconPlus size={16} />}
          onClick={() => form.insertListItem("products", { name: "", dose_per_hectare: 0, unit: "L/ha" })}
        >
          Agregar producto
        </Button>
```

(`form.insertListItem`/`removeListItem` son de `@mantine/form`.)

- [ ] **Step 5: Relabel tasa + quitar campos legacy + prefill del modal**

En la sección colapsable "Detalles de aplicación": quitar los `<Grid.Col>` de `application_rate` (NumberInput "Tasa de aplicación") y `application_rate_unit` (Select Unidad). Cambiar el label `"Agua/ha (L)"` del `water_per_hectare` por `"Tasa de aplicación (L/ha)"`. (El Tanque y el botón "Calcular mezcla" quedan.)

Y actualizar la llamada a `SprayMixModal` (al final) para pasar el nuevo prefill con productos:

```tsx
      <SprayMixModal
        opened={mixOpen}
        onClose={mix.close}
        prefill={{
          hectares: Number(form.values.hectares) || undefined,
          caldo_per_hectare: Number(form.values.water_per_hectare) || undefined,
          tank_volume_liters: Number(form.values.tank_volume_liters) || undefined,
          products: form.values.products
            .filter((p) => p.name.trim())
            .map((p) => ({ name: p.name.trim(), dose_per_hectare: Number(p.dose_per_hectare), unit: p.unit })),
        }}
      />
```

- [ ] **Step 6: Extender el test del form**

En `frontend/src/features/field-jobs/field-job-form.test.tsx`, añadir un test que verifique que se agrega una fila de producto:

```tsx
  it("permite agregar un producto a la lista", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /agregar producto/i }));
    expect(screen.getByPlaceholderText(/producto \/ medicamento/i)).toBeInTheDocument();
  });
```

(Si `renderForm`/imports no tienen `fireEvent`, importarlo de `@testing-library/react`.)

- [ ] **Step 7: Typecheck + tests + lint del archivo**

Run (en `frontend/`):
`npm run typecheck && npm run test -- field-job-form spray-mix`
Expected: typecheck 0 errores (ahora que SprayMixModal y el form usan los tipos nuevos); tests PASS.
Verificar que `npm run lint` no reporte errores nuevos en `field-jobs/`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobFormModal.tsx frontend/src/features/field-jobs/field-job-form.test.tsx
git commit -m "feat(field-jobs web): lista de productos en el formulario + tasa de aplicacion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Card de productos en `FieldJobDetailPage`

**Files:**
- Modify: `frontend/src/features/field-jobs/FieldJobDetailPage.tsx`

**Interfaces:**
- Consumes: `job.products` (del schema).

- [ ] **Step 1: Añadir el card de productos**

En `frontend/src/features/field-jobs/FieldJobDetailPage.tsx`, tras el card de totales (o donde estaba el `Field label="Producto"`), añadir un card que liste los productos cuando existan, y dejar el `applied_product` legacy solo si está y no hay productos:

```tsx
      {job.products && job.products.length > 0 ? (
        <Card>
          <Text fw={600} mb="xs">Productos aplicados</Text>
          {job.products.map((p) => (
            <Group key={p.id} justify="space-between">
              <Text>{p.name}</Text>
              <Text c="dimmed">{p.dose_per_hectare} {p.unit}</Text>
            </Group>
          ))}
        </Card>
      ) : job.applied_product ? (
        <Card><Field label="Producto" value={job.applied_product} /></Card>
      ) : null}
```

(Si el `Field label="Producto"` existente quedó dentro del card de info, quitarlo de ahí para no duplicar. Importar `Card`, `Group`, `Text` de `@mantine/core` si falta.)

- [ ] **Step 2: Typecheck**

Run (en `frontend/`): `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobDetailPage.tsx
git commit -m "feat(field-jobs web): card de productos aplicados en el detalle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 → 2 → 3 → 4. Task 1 deja el typecheck en rojo a propósito (los consumidores se migran en 2-3); el gate verde se confirma al final de Task 3 (`npm run typecheck` 0 errores).
- **Móvil:** queda para el plan de la fase móvil (lista de productos + `SprayCalculatorScreen` al nuevo modelo).
- **Fuera de alcance:** catálogo de productos reutilizable, descuento de inventario, persistir el resultado del cálculo.
