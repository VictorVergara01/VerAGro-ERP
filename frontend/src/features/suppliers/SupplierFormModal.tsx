import {
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { useSaveSupplier } from "./api";
import type { Supplier } from "./types";

interface FormValues {
  name: string;
  legal_name: string;
  country: string;
  contact_person: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  estimated_delivery_days: number | string;
  payment_terms: string;
  notes: string;
}

const EMPTY: FormValues = {
  name: "",
  legal_name: "",
  country: "",
  contact_person: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  address: "",
  estimated_delivery_days: "",
  payment_terms: "",
  notes: "",
};

export function SupplierFormModal({
  opened,
  onClose,
  supplier,
}: {
  opened: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}) {
  const save = useSaveSupplier();
  const editing = Boolean(supplier?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      name: (v) => (v.trim() ? null : "El nombre es obligatorio."),
      email: (v) =>
        !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Correo inválido.",
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        ...EMPTY,
        ...(supplier
          ? {
              ...supplier,
              estimated_delivery_days: supplier.estimated_delivery_days ?? "",
            }
          : {}),
      } as FormValues);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, supplier]);

  const handleSubmit = form.onSubmit(async (values) => {
    const payload = {
      ...values,
      id: supplier?.id,
      estimated_delivery_days: values.estimated_delivery_days
        ? Number(values.estimated_delivery_days)
        : null,
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<Supplier> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Proveedor actualizado." : "Proveedor creado.",
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
      title={editing ? "Editar proveedor" : "Nuevo proveedor"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Nombre" withAsterisk {...form.getInputProps("name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Razón social" {...form.getInputProps("legal_name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="País" {...form.getInputProps("country")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Contacto" {...form.getInputProps("contact_person")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Teléfono" {...form.getInputProps("phone")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="WhatsApp" {...form.getInputProps("whatsapp")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Correo" {...form.getInputProps("email")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Sitio web" {...form.getInputProps("website")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Días de entrega estimados"
              min={0}
              {...form.getInputProps("estimated_delivery_days")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Términos de pago" {...form.getInputProps("payment_terms")} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Dirección"
              autosize
              minRows={2}
              {...form.getInputProps("address")}
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
