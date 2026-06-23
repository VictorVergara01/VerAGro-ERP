import {
  ActionIcon,
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
            <NativeSelect label="Cultivo" data={CROP_OPTIONS} {...form.getInputProps("crop")} />
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
