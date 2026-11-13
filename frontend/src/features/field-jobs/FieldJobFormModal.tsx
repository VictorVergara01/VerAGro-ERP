import {
  Button,
  Collapse,
  Grid,
  Group,
  Modal,
  NativeSelect,
  NumberInput,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useFieldPlots } from "../field-plots/api";
import type { FieldPlot } from "../field-plots/types";
import { usePilots } from "../field-finance/api";
import { useCompany } from "../settings/api";
import { useSaveFieldJob } from "./api";
import { ChemicalRowsEditor, type ChemicalRow } from "./ChemicalRowsEditor";
import { SprayMixModal } from "./SprayMixModal";
import { CROP_OPTIONS, JOB_TYPE_OPTIONS, SOLID_UNIT_OPTIONS, PRODUCT_UNIT_OPTIONS, BILLING_UNIT_OPTIONS, type FieldJob } from "./types";

interface FormValues {
  job_type: string;
  billing_unit: string;
  quintals_per_hectare: number | string;
  planned_quintals: number | string;
  customer: string | null;
  plot: string | null;
  equipment: string | null;
  pilot: string | null;
  scheduled_date: string;
  location: string;
  crop: string;
  crop_other: string;
  products: ChemicalRow[];
  hectares: number | string;
  unit_price: number | string;
  notes: string;
  tank_volume_liters: number | string;
  water_per_hectare: number | string;
}

const EMPTY: FormValues = {
  job_type: "fumigation",
  billing_unit: "ha",
  quintals_per_hectare: "",
  planned_quintals: "",
  customer: null,
  plot: null,
  equipment: null,
  pilot: null,
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
  const pilots = usePilots();
  const company = useCompany();
  const solidRate = (unit: string) => unit === "qq"
    ? company.data?.spreading_price_per_quintal ?? "15"
    : company.data?.spreading_price_per_hectare ?? "25";
  const editing = Boolean(job?.id);
  const [appOpen, app] = useDisclosure(false);
  const [mixOpen, mix] = useDisclosure(false);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      customer: (v) => (v ? null : "Selecciona un cliente."),
      quintals_per_hectare: (v, values) => values.billing_unit === "qq" && !(Number(v) > 0) && !(Number(values.planned_quintals) > 0) ? "Indica los qq totales previstos o la dosis por hectárea." : null,
    },
  });

  const [plotLoaded, setPlotLoaded] = useState(false);
  const customerId = form.values.customer ? Number(form.values.customer) : undefined;
  const plots = useFieldPlots({ customer: customerId }, customerId != null);

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
              job_type: job.job_type ?? "fumigation",
              billing_unit: job.billing_unit ?? "ha",
              quintals_per_hectare: job.quintals_per_hectare ?? "",
              planned_quintals: job.planned_quintals ?? "",
              plot: job.plot ? String(job.plot) : null,
              equipment: job.equipment ? String(job.equipment) : null,
              pilot: job.pilot ? String(job.pilot) : null,
              scheduled_date: job.scheduled_date ?? "",
              location: job.location ?? "",
              crop: job.crop ?? "rice",
              crop_other: job.crop_other ?? "",
              hectares: job.hectares ?? 1,
              unit_price: job.unit_price ?? (job.job_type === "spreading" ? solidRate(job.billing_unit ?? "ha") : c?.fumigation_price_per_hectare ?? "20"),
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el aviso de lote al abrir el modal
      setPlotLoaded(false);
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, job]);

  const totalQuintals = form.values.planned_quintals !== "" ? Number(form.values.planned_quintals) : Number(((Number(form.values.hectares) || 0) * (Number(form.values.quintals_per_hectare) || 0)).toFixed(2));
  const billableQuantity = form.values.billing_unit === "qq" ? totalQuintals : Number(Number(form.values.hectares || 0).toFixed(2));
  const liveTotal = billableQuantity * (Number(form.values.unit_price) || 0);

  const submit = form.onSubmit(async (values) => {
    const payload = {
      id: job?.id,
      job_type: values.job_type,
      billing_unit: values.job_type === "spreading" ? values.billing_unit : "ha",
      quintals_per_hectare: values.job_type === "spreading" ? numOrNull(values.quintals_per_hectare) : null,
      planned_quintals: values.job_type === "spreading" ? numOrNull(values.planned_quintals) : null,
      customer: Number(values.customer),
      plot: values.plot ? Number(values.plot) : null,
      equipment: values.equipment ? Number(values.equipment) : null,
      pilot: values.pilot ? Number(values.pilot) : null,
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
      tank_volume_liters: values.job_type === "spreading" ? null : numOrNull(values.tank_volume_liters),
      water_per_hectare: values.job_type === "spreading" ? null : numOrNull(values.water_per_hectare),
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<FieldJob> & { id?: number });
      notifications.show({ color: "green", message: editing ? "Trabajo actualizado." : "Trabajo creado." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  const applyPlot = (value: string | null) => {
    form.setFieldValue("plot", value);
    const plot = (plots.data ?? []).find((p: FieldPlot) => String(p.id) === value);
    if (!plot) {
      setPlotLoaded(false);
      return;
    }
    form.setFieldValue("location", plot.location ?? "");
    form.setFieldValue("crop", plot.crop ?? "rice");
    form.setFieldValue("crop_other", plot.crop_other ?? "");
    form.setFieldValue("hectares", plot.hectares ?? 1);
    form.setFieldValue("water_per_hectare", plot.water_per_hectare ?? "");
    form.setFieldValue(
      "products",
      (plot.products ?? []).map((p) => ({
        name: p.name,
        unit: form.values.job_type === "spreading" ? "kg/ha" : (p.unit ?? "L/ha"),
        dose_per_hectare: form.values.job_type === "spreading" ? "" : (p.dose_per_hectare ?? ""),
      })),
    );
    setPlotLoaded(true);
  };

  // Si el lote enlazado al trabajo ya no está activo, no aparece en plots.data
  // (que solo trae lotes activos) y el Select quedaría en blanco. El propio job
  // trae su id y nombre (plot / plot_name), así que se agrega esa opción sin
  // pedirla de nuevo al backend.
  const plotOptions = (plots.data ?? []).map((p: FieldPlot) => ({
    value: String(p.id),
    label: p.name,
  }));
  if (
    job?.plot != null &&
    String(job.plot) === form.values.plot &&
    !plotOptions.some((o) => o.value === String(job.plot))
  ) {
    plotOptions.push({ value: String(job.plot), label: job.plot_name || "" });
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? "Editar trabajo" : "Nuevo trabajo de campo"} size="lg">
      <form onSubmit={submit}>
        <Grid>
          <Grid.Col span={12}>
            <Select label="Tipo de aplicación" data={JOB_TYPE_OPTIONS} value={form.values.job_type} allowDeselect={false}
              onChange={(value) => {
                form.setFieldValue("job_type", value ?? "fumigation");
                form.setFieldValue("billing_unit", "ha");
                form.setFieldValue("quintals_per_hectare", "");
                form.setFieldValue("planned_quintals", "");
                form.setFieldValue("unit_price", value === "spreading" ? solidRate("ha") : company.data?.fumigation_price_per_hectare ?? "20");
                // Una dosis líquida no se convierte automáticamente en masa.
                form.setFieldValue("products", []);
                mix.close();
              }} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Cliente"
              withAsterisk
              data={(customers.data?.results ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              searchable
              {...form.getInputProps("customer")}
              onChange={(v) => {
                form.setFieldValue("customer", v);
                form.setFieldValue("plot", null);
                setPlotLoaded(false);
              }}
            />
          </Grid.Col>
          {form.values.customer && (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Lote"
                placeholder="Sin lote"
                data={plotOptions}
                searchable
                clearable
                value={form.values.plot}
                onChange={applyPlot}
              />
              {plotLoaded && (
                <Text size="xs" c="teal" mt={4}>Datos del lote cargados</Text>
              )}
            </Grid.Col>
          )}
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
              data={(pilots.data ?? []).filter((t) => t.is_active || t.id === job?.pilot).map((t) => ({ value: String(t.id), label: t.name }))}
              searchable
              clearable
              {...form.getInputProps("pilot")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Fecha programada" type="date" {...form.getInputProps("scheduled_date")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Finca / Ubicación" {...form.getInputProps("location")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NativeSelect label="Cultivo" data={CROP_OPTIONS} {...form.getInputProps("crop")} />
          </Grid.Col>
          {form.values.crop === "other" && (
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <TextInput label="Especifica el cultivo" {...form.getInputProps("crop_other")} />
            </Grid.Col>
          )}

          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput label="Hectáreas programadas" min={0} decimalScale={4} {...form.getInputProps("hectares")} />
          </Grid.Col>
          {form.values.job_type === "spreading" && <>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Select label="Modalidad de cobro" data={BILLING_UNIT_OPTIONS} value={form.values.billing_unit} allowDeselect={false}
                description={form.values.billing_unit === "qq" ? "Habitual para urea: tarifa por cada qq aplicado." : "Habitual para semilla de pasto: tarifa por hectárea."}
                onChange={(v) => { form.setFieldValue("billing_unit", v ?? "ha"); form.setFieldValue("unit_price", solidRate(String(v ?? "ha"))); }} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <NumberInput label="Dosis prevista (qq/ha)" description="Opcional si indicas los qq totales previstos." min={0} decimalScale={4} {...form.getInputProps("quintals_per_hectare")} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <NumberInput label="Quintales totales previstos (qq)" description="Cantidad directa; tiene prioridad sobre la dosis prevista." min={0} decimalScale={2} {...form.getInputProps("planned_quintals")} />
            </Grid.Col>
            <Grid.Col span={12}><Text size="sm">Cantidad total prevista: <b>{totalQuintals} qq</b></Text></Grid.Col>
          </>}
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput label={form.values.billing_unit === "qq" ? "Precio/qq ($)" : "Precio/ha ($)"} min={0} decimalScale={2} {...form.getInputProps("unit_price")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Text size="sm" c="dimmed" mt={28}>Total estimado: <b>{formatCurrency(liveTotal)}</b> · {billableQuantity} {form.values.billing_unit}</Text>
          </Grid.Col>
        </Grid>

        <ChemicalRowsEditor
          solid={form.values.job_type === "spreading"}
          maxNote={form.values.job_type === "spreading" ? "Máximo 10 productos sólidos por trabajo." : undefined}
          title={form.values.job_type === "spreading" ? "Productos sólidos a aplicar" : "Químicos a aplicar"}
          unitOptions={form.values.job_type === "spreading" ? SOLID_UNIT_OPTIONS : PRODUCT_UNIT_OPTIONS}
          rows={form.values.products}
          onChange={(rows) => form.setFieldValue("products", rows)}
        />

        {/* Sección colapsable: aplicación */}
        {form.values.job_type === "fumigation" && <><Button variant="subtle" size="xs" mt="sm" onClick={app.toggle}>
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
        </>}

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
