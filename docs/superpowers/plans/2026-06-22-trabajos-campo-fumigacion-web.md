# Trabajos de Campo (Fumigación) — Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaptar el frontend web del módulo de Trabajos de Campo al backend reconstruido: formulario y detalle solo-fumigación, cultivo como selector (arroz/maíz/pasto/otros), tope de 10 químicos con unidades L/ha·cc/ha, y quitar todas las referencias a campos eliminados (esparcido/quintales, producto único, clima, GPS).

**Architecture:** El backend ya cambió y el schema tipado fue regenerado (`npm run gen:api` → `FieldJob` con `crop` (CropEnum), `crop_display`, `crop_other`; sin `applied_product`, `quintals`, `application_rate*`, clima ni GPS). Se actualizan los 4 archivos de UI (`types.ts`, `FieldJobFormModal`, `FieldJobDetailPage`, `FieldJobsPage`) y sus tests. La calculadora (`SprayMixModal`) no cambia (solo verá 2 unidades al limitar `PRODUCT_UNIT_OPTIONS`).

**Tech Stack:** React 19 + Vite + TypeScript + Mantine v9.3 + @mantine/form + TanStack Query + openapi-fetch. Tests: Vitest + RTL. Gates: `npm run typecheck`, `npm run lint`, `npm run test`. Desde `frontend/`.

## Global Constraints

- Rama `V2.0`; **no** mergear a master sin pedido explícito.
- **Solo fumigación** en la UI: no hay selector de tipo de trabajo ni campos de esparcido/quintales. `job_type` se envía siempre `"fumigation"`. El enum `spreading` existe en el backend reservado, pero la web no lo expone.
- Cultivo: selector con opciones **Arroz/Maíz/Pasto/Otros** (valores `rice`/`corn`/`pasture`/`other`); al elegir **Otros** se habilita un texto libre que mapea a `crop_other`.
- Químicos: unidades **L/ha y cc/ha** únicamente en la UI; **hasta 10** (deshabilitar "Agregar producto" al llegar a 10).
- Tanque default 200 y tasa de aplicación: se prellenan desde `useCompany()` (`drone_tank_volume_liters`, `default_water_per_hectare`).
- Mantine v9.3: `Collapse` usa el prop **`expanded`** (no `in`).
- Quitar toda referencia a campos eliminados del modelo: `quintals`, `applied_product`, `application_rate`, `application_rate_unit`, `latitude`, `longitude`, `wind_speed_kmh`, `temperature_celsius`, `humidity_percentage`, `weather_notes`.
- Commits en español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `frontend/src/lib/api/schema.d.ts` — ya regenerado; se commitea junto con Task 1.
- `frontend/src/features/field-jobs/types.ts` — `CROP_OPTIONS`; `PRODUCT_UNIT_OPTIONS` reducido a L/ha·cc/ha.
- `frontend/src/features/field-jobs/FieldJobFormModal.tsx` — formulario solo-fumigación, cultivo selector + otros, tope 10.
- `frontend/src/features/field-jobs/FieldJobDetailPage.tsx` — detalle limpio.
- `frontend/src/features/field-jobs/FieldJobsPage.tsx` — lista limpia (sin columna Tipo ni Ha/Qq de quintales).
- Tests: `field-job-form.test.tsx`, `field-job-detail.test.tsx`, `field-jobs-page.test.tsx`.

**Nota:** Task 1 deja el typecheck en ROJO a propósito (los componentes aún usan campos viejos); queda VERDE al terminar Task 4. La verificación global es Task 5.

---

### Task 1: types.ts — opciones de cultivo y unidades líquidas

**Files:**
- Modify: `frontend/src/features/field-jobs/types.ts`
- Modify (commit): `frontend/src/lib/api/schema.d.ts` (ya regenerado)

**Interfaces:**
- Produces: `CROP_OPTIONS: {value,label}[]` (rice/corn/pasture/other); `PRODUCT_UNIT_OPTIONS` con solo `L/ha` y `cc/ha`.

- [ ] **Step 1: Agregar CROP_OPTIONS y reducir PRODUCT_UNIT_OPTIONS**

En `frontend/src/features/field-jobs/types.ts`, reemplazar el bloque actual de `PRODUCT_UNIT_OPTIONS` por:

```ts
export const CROP_OPTIONS = [
  { value: "rice", label: "Arroz" },
  { value: "corn", label: "Maíz" },
  { value: "pasture", label: "Pasto" },
  { value: "other", label: "Otros" },
];

// Solo líquidos para fumigación (el backend conserva kg/ha y g/ha para sólidos).
export const PRODUCT_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "cc/ha", label: "cc/ha" },
];
```

(El resto de `types.ts` —`JOB_TYPE_OPTIONS`, `FJ_STATUS_*`, `SprayMix*`— queda igual.)

- [ ] **Step 2: Verificar que types.ts no tiene errores propios**

Run: `npm run typecheck 2>&1 | grep "types.ts" || echo "types.ts OK"`
Expected: `types.ts OK` (los errores que queden estarán en los componentes, no en types.ts).

- [ ] **Step 3: Commit (schema + types)**

```bash
git add frontend/src/lib/api/schema.d.ts frontend/src/features/field-jobs/types.ts
git commit -m "feat(field-jobs web): schema regenerado y opciones de cultivo/unidades liquidas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: FieldJobFormModal — formulario solo-fumigación

**Files:**
- Modify: `frontend/src/features/field-jobs/FieldJobFormModal.tsx` (reescritura)
- Test: `frontend/src/features/field-jobs/field-job-form.test.tsx` (reescribir)

**Interfaces:**
- Consumes: `CROP_OPTIONS`, `PRODUCT_UNIT_OPTIONS`, `FieldJob` de `./types`; `useSaveFieldJob` de `./api`; `SprayMixModal`.

- [ ] **Step 1: Reescribir el test del formulario**

Reemplazar todo el contenido de `frontend/src/features/field-jobs/field-job-form.test.tsx` por:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldJobFormModal } from "./FieldJobFormModal";

vi.mock("./api", () => ({
  useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCalculateMix: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({
  useCompany: () => ({
    data: { fumigation_price_per_hectare: "20", drone_tank_volume_liters: "200",
      default_water_per_hectare: "8" },
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
  it("muestra Hectáreas (fumigación) y NO muestra Quintales", () => {
    renderForm();
    expect(screen.getByLabelText(/hectáreas/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/quintales/i)).not.toBeInTheDocument();
  });

  it("revela el texto de cultivo al elegir Otros", () => {
    renderForm();
    expect(screen.queryByLabelText(/especifica el cultivo/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^cultivo$/i), { target: { value: "other" } });
    expect(screen.getByLabelText(/especifica el cultivo/i)).toBeInTheDocument();
  });

  it("permite agregar un químico a la lista", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /agregar químico/i }));
    expect(screen.getByPlaceholderText(/nombre del químico/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npm run test -- field-job-form 2>&1 | tail -15`
Expected: FAIL (el formulario aún tiene el SegmentedControl de tipo, no tiene el Select de cultivo con "other", y el botón se llama "Agregar producto").

- [ ] **Step 3: Reescribir el formulario**

Reemplazar todo el contenido de `frontend/src/features/field-jobs/FieldJobFormModal.tsx` por:

```tsx
import {
  ActionIcon,
  Button,
  Collapse,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect } from "react";

import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useTechnicians } from "../service-orders/api";
import { useCompany } from "../settings/api";
import { useSaveFieldJob } from "./api";
import { SprayMixModal } from "./SprayMixModal";
import { CROP_OPTIONS, PRODUCT_UNIT_OPTIONS, type FieldJob } from "./types";

const MAX_PRODUCTS = 10;

interface FormValues {
  customer: string | null;
  equipment: string | null;
  technician: string | null;
  scheduled_date: string;
  location: string;
  crop: string;
  crop_other: string;
  products: { name: string; dose_per_hectare: number | string; unit: string }[];
  hectares: number | string;
  unit_price: number | string;
  notes: string;
  tank_volume_liters: number | string;
  water_per_hectare: number | string;
}

const EMPTY: FormValues = {
  customer: null,
  equipment: null,
  technician: null,
  scheduled_date: "",
  location: "",
  crop: "rice",
  crop_other: "",
  products: [],
  hectares: 1,
  unit_price: 0,
  notes: "",
  tank_volume_liters: "",
  water_per_hectare: "",
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
  const [mixOpen, mix] = useDisclosure(false);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: { customer: (v) => (v ? null : "Selecciona un cliente.") },
  });

  useEffect(() => {
    if (opened) {
      const c = company.data as Record<string, string> | undefined;
      form.setValues({
        ...EMPTY,
        unit_price: job?.unit_price ?? c?.fumigation_price_per_hectare ?? "20",
        tank_volume_liters: c?.drone_tank_volume_liters ?? "",
        water_per_hectare: c?.default_water_per_hectare ?? "",
        ...(job
          ? {
              customer: job.customer ? String(job.customer) : null,
              equipment: job.equipment ? String(job.equipment) : null,
              technician: job.technician ? String(job.technician) : null,
              scheduled_date: job.scheduled_date ?? "",
              location: job.location ?? "",
              crop: job.crop ?? "rice",
              crop_other: job.crop_other ?? "",
              hectares: job.hectares ?? 1,
              unit_price: job.unit_price ?? "20",
              notes: job.notes ?? "",
              tank_volume_liters: job.tank_volume_liters ?? "",
              water_per_hectare: job.water_per_hectare ?? "",
              products: (job.products ?? []).map((p) => ({
                name: p.name,
                dose_per_hectare: p.dose_per_hectare ?? "",
                unit: p.unit,
              })),
            }
          : {}),
      } as FormValues);
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, job]);

  const liveTotal =
    (Number(form.values.hectares) || 0) * (Number(form.values.unit_price) || 0);

  const submit = form.onSubmit(async (values) => {
    const payload = {
      id: job?.id,
      job_type: "fumigation",
      customer: Number(values.customer),
      equipment: values.equipment ? Number(values.equipment) : null,
      technician: values.technician ? Number(values.technician) : null,
      scheduled_date: values.scheduled_date || undefined,
      location: values.location,
      crop: values.crop,
      crop_other: values.crop === "other" ? values.crop_other : "",
      products: values.products
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dose_per_hectare: String(p.dose_per_hectare || 0), unit: p.unit })),
      hectares: String(values.hectares || 0),
      unit_price: String(values.unit_price || 0),
      notes: values.notes,
      tank_volume_liters: numOrNull(values.tank_volume_liters),
      water_per_hectare: numOrNull(values.water_per_hectare),
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
              label="Piloto"
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
            <Select label="Cultivo" data={CROP_OPTIONS} allowDeselect={false} {...form.getInputProps("crop")} />
          </Grid.Col>
          {form.values.crop === "other" && (
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <TextInput label="Especifica el cultivo" {...form.getInputProps("crop_other")} />
            </Grid.Col>
          )}

          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput label="Hectáreas" min={0} decimalScale={4} {...form.getInputProps("hectares")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput label="Precio/ha ($)" min={0} decimalScale={2} {...form.getInputProps("unit_price")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Text size="sm" c="dimmed" mt={28}>Total estimado: <b>{formatCurrency(liveTotal)}</b></Text>
          </Grid.Col>
        </Grid>

        <Text fw={600} size="sm" mt="sm">Químicos a aplicar</Text>
        {form.values.products.map((p, i) => (
          <Group key={i} wrap="nowrap" mt={4}>
            <TextInput
              placeholder="Nombre del químico"
              value={p.name}
              onChange={(e) => form.setFieldValue(`products.${i}.name`, e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <NumberInput
              placeholder="Dosis/ha"
              min={0}
              decimalScale={4}
              value={p.dose_per_hectare}
              onChange={(v) => form.setFieldValue(`products.${i}.dose_per_hectare`, v as number | string)}
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
              aria-label="Quitar químico"
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
          disabled={form.values.products.length >= MAX_PRODUCTS}
          onClick={() => form.insertListItem("products", { name: "", dose_per_hectare: 0, unit: "L/ha" })}
        >
          Agregar químico
        </Button>
        {form.values.products.length >= MAX_PRODUCTS && (
          <Text size="xs" c="dimmed" mt={4}>Máximo {MAX_PRODUCTS} químicos por trabajo.</Text>
        )}

        {/* Sección colapsable: aplicación */}
        <Button variant="subtle" size="xs" mt="sm" onClick={app.toggle}>
          {appOpen ? "− " : "+ "}Detalles de aplicación
        </Button>
        <Collapse expanded={appOpen}>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <NumberInput label="Tasa de aplicación (L/ha)" min={0} decimalScale={2} {...form.getInputProps("water_per_hectare")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <NumberInput label="Tanque (L)" min={0} decimalScale={2} {...form.getInputProps("tank_volume_liters")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Button variant="light" size="xs" mt={28} onClick={mix.open}>Calcular mezcla</Button>
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
          caldo_per_hectare: Number(form.values.water_per_hectare) || undefined,
          tank_volume_liters: Number(form.values.tank_volume_liters) || undefined,
          products: form.values.products
            .filter((p) => p.name.trim())
            .map((p) => ({ name: p.name.trim(), dose_per_hectare: Number(p.dose_per_hectare), unit: p.unit })),
        }}
      />
    </Modal>
  );
}
```

- [ ] **Step 4: Correr el test del formulario**

Run: `npm run test -- field-job-form 2>&1 | tail -8`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobFormModal.tsx frontend/src/features/field-jobs/field-job-form.test.tsx
git commit -m "feat(field-jobs web): formulario solo-fumigacion con cultivo y tope de 10 quimicos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: FieldJobDetailPage — detalle limpio

**Files:**
- Modify: `frontend/src/features/field-jobs/FieldJobDetailPage.tsx`
- Test: `frontend/src/features/field-jobs/field-job-detail.test.tsx`

**Interfaces:**
- Consumes: `FieldJob` (con `crop_display`, `crop_other`, sin campos eliminados).

- [ ] **Step 1: Actualizar el mock del test del detalle**

En `frontend/src/features/field-jobs/field-job-detail.test.tsx`, reemplazar el objeto `job` por (quita `quintals`, usa `crop_display`):

```tsx
const job = {
  id: 1, number: "TC-000001", job_type: "fumigation", job_type_display: "Fumigación",
  status: "scheduled", status_display: "Programado", customer_name: "Finca La Esperanza",
  location: "Lote 3", crop: "rice", crop_display: "Arroz", crop_other: "",
  scheduled_date: "2026-06-18", hectares: "12.5000", unit_price: "20.00", total: "250.00",
};
```

- [ ] **Step 2: Correr el test para verlo fallar (typecheck del componente)**

Run: `npm run test -- field-job-detail 2>&1 | tail -12`
Expected: FAIL o error de typecheck — el componente aún referencia `job.applied_product`, `job.quintals`, `job.wind_speed_kmh`, etc., que ya no existen en el tipo.

- [ ] **Step 3: Limpiar el detalle**

Reemplazar todo el contenido de `frontend/src/features/field-jobs/FieldJobDetailPage.tsx` por:

```tsx
import { Alert, Badge, Button, Card, Grid, Group, Loader, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit } from "@tabler/icons-react";
import { useParams } from "react-router-dom";

import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import { useFieldJob, useFieldJobAction } from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";
import { FJ_STATUS_COLOR, FJ_STATUS_LABEL } from "./types";

export function FieldJobDetailPage() {
  const { id } = useParams();
  const jobId = id ? Number(id) : undefined;
  const { data: job, isLoading, error } = useFieldJob(jobId);
  const action = useFieldJobAction(jobId);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !job) return <Alert color="red">No se pudo cargar el trabajo.</Alert>;

  const status = job.status ?? "scheduled";
  const cropLabel = job.crop === "other" ? (job.crop_other || "Otros") : (job.crop_display || "—");

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
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Piloto" value={job.technician_name || "Sin asignar"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cultivo" value={cropLabel} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Finca" value={job.location || "—"} /></Grid.Col>
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
              <Text c="dimmed">Hectáreas</Text>
              <Text>{job.hectares}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Precio/ha</Text>
              <Text>{formatCurrency(job.unit_price)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(job.total)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      {job.products && job.products.length > 0 && (
        <Card>
          <Text fw={600} mb="xs">Químicos aplicados</Text>
          {job.products.map((p) => (
            <Group key={p.id} justify="space-between">
              <Text>{p.name}</Text>
              <Text c="dimmed">{p.dose_per_hectare} {p.unit}</Text>
            </Group>
          ))}
        </Card>
      )}

      {(job.water_per_hectare != null || job.tank_volume_liters != null) && (
        <Card><Text fw={600} mb="xs">Aplicación</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 4 }}><Field label="Tasa de aplicación (L/ha)" value={job.water_per_hectare ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}><Field label="Tanque (L)" value={job.tank_volume_liters ?? "—"} /></Grid.Col>
          </Grid>
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

- [ ] **Step 4: Correr el test del detalle**

Run: `npm run test -- field-job-detail 2>&1 | tail -8`
Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobDetailPage.tsx frontend/src/features/field-jobs/field-job-detail.test.tsx
git commit -m "feat(field-jobs web): detalle limpio (cultivo, sin clima/gps/quintales)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: FieldJobsPage — lista limpia

**Files:**
- Modify: `frontend/src/features/field-jobs/FieldJobsPage.tsx`
- Test: `frontend/src/features/field-jobs/field-jobs-page.test.tsx`

**Interfaces:**
- Consumes: `FieldJob` (sin `quintals`); `useFieldJobs`.

- [ ] **Step 1: Actualizar el mock del test de la lista**

En `frontend/src/features/field-jobs/field-jobs-page.test.tsx`, en el objeto de `results`, quitar `quintals: "0.0000"` (el resto queda).

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npm run test -- field-jobs-page 2>&1 | tail -12`
Expected: FAIL o error de typecheck — la lista referencia `j.quintals` (ya removido).

- [ ] **Step 3: Limpiar la lista (sin columna Tipo ni quintales)**

En `frontend/src/features/field-jobs/FieldJobsPage.tsx`:

Reemplazar el import de `./types` por (quita `JOB_TYPE_LABEL`, `JOB_TYPE_OPTIONS`):
```tsx
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  FJ_STATUS_OPTIONS,
  type FieldJob,
} from "./types";
```

Quitar el estado y filtro de tipo: eliminar la línea `const [jobType, setJobType] = useState<string | null>(null);`, la propiedad `job_type: jobType || undefined,` del objeto pasado a `useFieldJobs`, y el `<Select placeholder="Tipo" ... />` del toolbar.

Reemplazar el arreglo `columns` por (sin columna Tipo; Ha en vez de Ha/Qq con quintales):
```tsx
  const columns: Column<FieldJob>[] = [
    { header: "N.º", render: (j) => j.number },
    { header: "Cliente", render: (j) => j.customer_name ?? "—" },
    { header: "Finca", render: (j) => j.location || "—" },
    { header: "Programado", render: (j) => formatDate(j.scheduled_date) },
    { header: "Ha", align: "right", render: (j) => `${j.hectares} ha` },
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
```

Cambiar el subtítulo del `PageHeader` de `"Fumigación y esparcido con drones."` a `"Fumigación con drones."`.

- [ ] **Step 4: Correr el test de la lista**

Run: `npm run test -- field-jobs-page 2>&1 | tail -8`
Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobsPage.tsx frontend/src/features/field-jobs/field-jobs-page.test.tsx
git commit -m "feat(field-jobs web): lista solo-fumigacion (sin columna tipo ni quintales)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verificación global (typecheck + lint + suite)

**Files:** (sin cambios salvo correcciones de regresión)

- [ ] **Step 1: Typecheck verde**

Run: `npm run typecheck`
Expected: 0 errores en todo el proyecto. Si queda alguna referencia a campos eliminados en otro archivo (p. ej. `api.ts` del feature), corregirla con el cambio mínimo.

- [ ] **Step 2: Lint limpio en field-jobs**

Run: `npm run lint 2>&1 | grep -i "field-jobs" || echo "sin errores de lint en field-jobs"`
Expected: `sin errores de lint en field-jobs`.

- [ ] **Step 3: Suite completa verde**

Run: `npm run test 2>&1 | grep -E "Test Files|Tests "`
Expected: todos los archivos de test PASS (sin regresiones).

- [ ] **Step 4: Commit (si hubo correcciones)**

```bash
git add -A
git commit -m "fix(field-jobs web): ajustes de typecheck/lint tras el rebuild

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Omitir si no hubo cambios.)

---

## Self-Review

- **Spec coverage:** cultivo selector + otros (Task 2 form, Task 3 detalle), solo-fumigación sin quintales/tipo (Task 2 form, Task 4 lista), químicos L/ha·cc/ha + tope 10 (Task 1 unidades, Task 2 form), quitar clima/GPS/applied_product (Task 2/3), calculadora intacta (SprayMixModal no se toca). Cubierto.
- **Placeholder scan:** sin TBD/TODO; código completo en cada paso.
- **Type consistency:** `crop` usa valores `rice/corn/pasture/other` y `crop_display`/`crop_other` consistentes entre form, detalle y tests; `PRODUCT_UNIT_OPTIONS` reducido se usa igual en form y SprayMixModal; payload de submit envía `job_type:"fumigation"` fijo y `crop_other` solo cuando `crop==="other"`.
- **Mantine v9.3:** `Collapse expanded={appOpen}` correcto.
