import {
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useSaveServiceOrder, useTechnicians } from "./api";
import { SERVICE_TYPE_OPTIONS, type ServiceOrder } from "./types";

interface FormValues {
  customer: string | null;
  equipment: string | null;
  technician: string | null;
  service_type: string;
  received_date: string;
  estimated_delivery_date: string;
  customer_complaint: string;
  diagnostic_summary: string;
  technical_notes: string;
  labor_cost: number | string;
  diagnostic_fee: number | string;
  discount_percentage: number | string;
  tax_percentage: number | string;
}

const EMPTY: FormValues = {
  customer: null,
  equipment: null,
  technician: null,
  service_type: "diagnostic",
  received_date: "",
  estimated_delivery_date: "",
  customer_complaint: "",
  diagnostic_summary: "",
  technical_notes: "",
  labor_cost: 0,
  diagnostic_fee: 0,
  discount_percentage: 0,
  tax_percentage: 0,
};

export function ServiceOrderFormModal({
  opened,
  onClose,
  order,
}: {
  opened: boolean;
  onClose: () => void;
  order?: ServiceOrder | null;
}) {
  const save = useSaveServiceOrder();
  const customers = useCustomers({});
  const technicians = useTechnicians();
  const editing = Boolean(order?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: { customer: (v) => (v ? null : "Selecciona un cliente.") },
  });

  const equipment = useEquipmentList(
    form.values.customer ? { customer: Number(form.values.customer) } : {},
  );

  useEffect(() => {
    if (opened) {
      form.setValues({
        ...EMPTY,
        ...(order
          ? {
              ...order,
              customer: order.customer ? String(order.customer) : null,
              equipment: order.equipment ? String(order.equipment) : null,
              received_date: order.received_date ?? "",
              estimated_delivery_date: order.estimated_delivery_date ?? "",
            }
          : {}),
        technician: order?.technician ? String(order.technician) : null,
      } as FormValues);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, order]);

  const handleSubmit = form.onSubmit(async (values) => {
    const payload = {
      id: order?.id,
      customer: Number(values.customer),
      equipment: values.equipment ? Number(values.equipment) : null,
      technician: values.technician ? Number(values.technician) : null,
      service_type: values.service_type,
      received_date: values.received_date || undefined,
      estimated_delivery_date: values.estimated_delivery_date || null,
      customer_complaint: values.customer_complaint,
      diagnostic_summary: values.diagnostic_summary,
      technical_notes: values.technical_notes,
      labor_cost: String(values.labor_cost || 0),
      diagnostic_fee: String(values.diagnostic_fee || 0),
      discount_percentage: String(values.discount_percentage || 0),
      tax_percentage: String(values.tax_percentage || 0),
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<ServiceOrder> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Orden actualizada." : "Orden creada.",
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
      title={editing ? "Editar orden" : "Nueva orden de servicio"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Cliente"
              withAsterisk
              data={(customers.data?.results ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
              searchable
              {...form.getInputProps("customer")}
              onChange={(v) => {
                form.setFieldValue("customer", v);
                form.setFieldValue("equipment", null);
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Equipo"
              placeholder={form.values.customer ? "Selecciona equipo" : "Elige cliente primero"}
              data={(equipment.data?.results ?? []).map((e) => ({
                value: String(e.id),
                label: e.name,
              }))}
              searchable
              clearable
              disabled={!form.values.customer}
              {...form.getInputProps("equipment")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Tipo de servicio"
              data={SERVICE_TYPE_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps("service_type")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Técnico asignado"
              placeholder="Sin asignar"
              data={(technicians.data ?? []).map((t) => ({
                value: String(t.id),
                label: t.full_name,
              }))}
              searchable
              clearable
              {...form.getInputProps("technician")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput
              label="Fecha recibido"
              type="date"
              {...form.getInputProps("received_date")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput
              label="Entrega estimada"
              type="date"
              {...form.getInputProps("estimated_delivery_date")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Reclamo del cliente"
              autosize
              minRows={2}
              {...form.getInputProps("customer_complaint")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Diagnóstico"
              autosize
              minRows={2}
              {...form.getInputProps("diagnostic_summary")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Mano de obra" min={0} decimalScale={2} {...form.getInputProps("labor_cost")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Diagnóstico $" min={0} decimalScale={2} {...form.getInputProps("diagnostic_fee")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Descuento %" min={0} decimalScale={2} {...form.getInputProps("discount_percentage")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Impuesto %" min={0} decimalScale={2} {...form.getInputProps("tax_percentage")} />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
