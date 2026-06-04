import {
  Button,
  Grid,
  Group,
  Modal,
  Select,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { useCustomers } from "../customers/api";
import { useEquipmentTypes, useSaveEquipment } from "./api";
import {
  OWNER_TYPE_OPTIONS,
  STATUS_OPTIONS,
  type Equipment,
} from "./types";

interface FormValues {
  owner_type: string;
  customer: string | null;
  equipment_type: string | null;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
  internal_code: string;
  purchase_date: string;
  warranty_expiration: string;
  status: string;
  notes: string;
}

const EMPTY: FormValues = {
  owner_type: "customer",
  customer: null,
  equipment_type: null,
  name: "",
  brand: "",
  model: "",
  serial_number: "",
  internal_code: "",
  purchase_date: "",
  warranty_expiration: "",
  status: "active",
  notes: "",
};

export function EquipmentFormModal({
  opened,
  onClose,
  equipment,
}: {
  opened: boolean;
  onClose: () => void;
  equipment?: Equipment | null;
}) {
  const save = useSaveEquipment();
  const types = useEquipmentTypes();
  const customers = useCustomers({});
  const editing = Boolean(equipment?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      name: (v) => (v.trim() ? null : "El nombre es obligatorio."),
      equipment_type: (v) => (v ? null : "Selecciona un tipo."),
      customer: (v, values) =>
        values.owner_type === "customer" && !v
          ? "Un equipo de cliente requiere un cliente."
          : null,
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        ...EMPTY,
        ...(equipment
          ? {
              ...equipment,
              customer: equipment.customer ? String(equipment.customer) : null,
              equipment_type: equipment.equipment_type
                ? String(equipment.equipment_type)
                : null,
              purchase_date: equipment.purchase_date ?? "",
              warranty_expiration: equipment.warranty_expiration ?? "",
            }
          : {}),
      } as FormValues);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, equipment]);

  const typeOptions = (types.data ?? []).map((t) => ({
    value: String(t.id),
    label: t.name,
  }));
  const customerOptions = (customers.data?.results ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const handleSubmit = form.onSubmit(async (values) => {
    const isCompany = values.owner_type === "company";
    const payload = {
      ...values,
      id: equipment?.id,
      customer: isCompany || !values.customer ? null : Number(values.customer),
      equipment_type: values.equipment_type ? Number(values.equipment_type) : null,
      purchase_date: values.purchase_date || null,
      warranty_expiration: values.warranty_expiration || null,
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<Equipment> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Equipo actualizado." : "Equipo creado.",
      });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  const isCustomerOwned = form.values.owner_type === "customer";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "Editar equipo" : "Nuevo equipo"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Propietario"
              data={OWNER_TYPE_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps("owner_type")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Cliente"
              placeholder={isCustomerOwned ? "Selecciona cliente" : "No aplica (empresa)"}
              data={customerOptions}
              searchable
              clearable
              disabled={!isCustomerOwned}
              {...form.getInputProps("customer")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Tipo de equipo"
              withAsterisk
              data={typeOptions}
              searchable
              {...form.getInputProps("equipment_type")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Nombre" withAsterisk {...form.getInputProps("name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Marca" {...form.getInputProps("brand")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Modelo" {...form.getInputProps("model")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="N.º de serie" {...form.getInputProps("serial_number")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Código interno" {...form.getInputProps("internal_code")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Fecha de compra"
              type="date"
              {...form.getInputProps("purchase_date")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Vence garantía"
              type="date"
              {...form.getInputProps("warranty_expiration")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Estado"
              data={STATUS_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps("status")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Notas" autosize minRows={2} {...form.getInputProps("notes")} />
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
