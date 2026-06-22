import {
  ActionIcon,
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
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect } from "react";

import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useTechnicians } from "../service-orders/api";
import { useCompany } from "../settings/api";
import { useSaveFieldJob } from "./api";
import { SprayMixModal } from "./SprayMixModal";
import { JOB_TYPE_OPTIONS, PRODUCT_UNIT_OPTIONS, type FieldJob } from "./types";

interface FormValues {
  job_type: string;
  customer: string | null;
  equipment: string | null;
  technician: string | null;
  scheduled_date: string;
  location: string;
  crop: string;
  products: { name: string; dose_per_hectare: number | string; unit: string }[];
  hectares: number | string;
  quintals: number | string;
  unit_price: number | string;
  notes: string;
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
  products: [],
  hectares: 0,
  quintals: 0,
  unit_price: 0,
  notes: "",
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

  const isFumigation = form.values.job_type === "fumigation";
  const liveTotal =
    (Number(isFumigation ? form.values.hectares : form.values.quintals) || 0) *
    (Number(form.values.unit_price) || 0);

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
      products: values.products
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dose_per_hectare: String(p.dose_per_hectare || 0), unit: p.unit })),
      hectares: String(values.hectares || 0),
      quintals: String(values.quintals || 0),
      unit_price: String(values.unit_price || 0),
      notes: values.notes,
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
              onChange={(v) => {
                if (!v) return;
                const c = company.data as Record<string, string> | undefined;
                const defaultFor = (t: string) =>
                  t === "spreading" ? (c?.spreading_price_per_quintal ?? "10") : (c?.fumigation_price_per_hectare ?? "20");
                const prevDefault = defaultFor(form.values.job_type);
                form.setFieldValue("job_type", v);
                if (!editing && String(form.values.unit_price) === String(prevDefault)) {
                  form.setFieldValue("unit_price", defaultFor(v));
                }
              }}
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
            <TextInput label="Cultivo" {...form.getInputProps("crop")} />
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

        <Text fw={600} size="sm" mt="sm">Productos a aplicar</Text>
        {form.values.products.map((p, i) => (
          <Group key={i} wrap="nowrap" mt={4}>
            <TextInput
              placeholder="Producto / medicamento"
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

        {/* Sección colapsable: clima */}
        <Button variant="subtle" size="xs" mt="xs" onClick={weather.toggle}>
          {weatherOpen ? "− " : "+ "}Condiciones climáticas
        </Button>
        <Collapse expanded={weatherOpen}>
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
        <Collapse expanded={gpsOpen}>
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
