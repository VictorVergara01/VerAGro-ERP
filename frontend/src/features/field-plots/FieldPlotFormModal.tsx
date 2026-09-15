import {
  Button,
  Grid,
  Group,
  Modal,
  NativeSelect,
  NumberInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { ChemicalRowsEditor, type ChemicalRow } from "../field-jobs/ChemicalRowsEditor";
import { CROP_OPTIONS } from "../field-jobs/types";
import { useSaveFieldPlot } from "./api";
import type { FieldPlot } from "./types";

interface FormValues {
  name: string;
  hectares: number | string;
  crop: string;
  crop_other: string;
  location: string;
  water_per_hectare: number | string;
  notes: string;
  products: ChemicalRow[];
}

const EMPTY: FormValues = {
  name: "",
  hectares: 1,
  crop: "rice",
  crop_other: "",
  location: "",
  water_per_hectare: "",
  notes: "",
  products: [],
};

const numOrNull = (v: number | string) => (v === "" || v == null ? null : String(v));

export function FieldPlotFormModal({
  opened,
  onClose,
  customerId,
  plot,
}: {
  opened: boolean;
  onClose: () => void;
  customerId: number;
  plot?: FieldPlot | null;
}) {
  const save = useSaveFieldPlot();
  const editing = Boolean(plot?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: { name: (v) => (v.trim() ? null : "Escribe un nombre para el lote.") },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        ...EMPTY,
        ...(plot
          ? {
              name: plot.name ?? "",
              hectares: plot.hectares ?? 1,
              crop: plot.crop ?? "rice",
              crop_other: plot.crop_other ?? "",
              location: plot.location ?? "",
              water_per_hectare: plot.water_per_hectare ?? "",
              notes: plot.notes ?? "",
              products: (plot.products ?? []).map((p) => ({
                name: p.name,
                dose_per_hectare: p.dose_per_hectare ?? "",
                unit: p.unit ?? "L/ha",
              })),
            }
          : {}),
      } as FormValues);
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, plot]);

  const submit = form.onSubmit(async (values) => {
    const payload = {
      id: plot?.id,
      customer: customerId,
      name: values.name.trim(),
      hectares: String(values.hectares || 0),
      crop: values.crop,
      crop_other: values.crop === "other" ? values.crop_other : "",
      location: values.location,
      water_per_hectare: numOrNull(values.water_per_hectare),
      notes: values.notes,
      products: values.products
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          dose_per_hectare: String(p.dose_per_hectare || 0),
          unit: p.unit,
        })),
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<FieldPlot> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Lote actualizado." : "Lote creado.",
      });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "Editar lote" : "Nuevo lote"}
      size="lg"
    >
      <form onSubmit={submit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Nombre del lote" withAsterisk {...form.getInputProps("name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Ubicación" {...form.getInputProps("location")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Hectáreas" min={0} decimalScale={4} {...form.getInputProps("hectares")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NativeSelect label="Cultivo" data={CROP_OPTIONS} {...form.getInputProps("crop")} />
          </Grid.Col>
          {form.values.crop === "other" && (
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <TextInput label="Especifica el cultivo" {...form.getInputProps("crop_other")} />
            </Grid.Col>
          )}
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput
              label="Tasa de aplicación (L/ha)"
              min={0}
              decimalScale={2}
              {...form.getInputProps("water_per_hectare")}
            />
          </Grid.Col>
        </Grid>

        <ChemicalRowsEditor
          rows={form.values.products}
          title="Químicos habituales"
          maxNote="Máximo 10 químicos por lote."
          onChange={(rows) => form.setFieldValue("products", rows)}
        />

        <Textarea label="Notas" autosize minRows={2} mt="sm" {...form.getInputProps("notes")} />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Guardar</Button>
        </Group>
      </form>
    </Modal>
  );
}
