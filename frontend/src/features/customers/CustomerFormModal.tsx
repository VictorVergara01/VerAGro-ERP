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

import { useSaveCustomer } from "./api";
import {
  CUSTOMER_TYPE_OPTIONS,
  ID_TYPE_OPTIONS,
  type Customer,
} from "./types";

type FormValues = {
  customer_type: string;
  name: string;
  legal_name: string;
  identification_type: string;
  identification_number: string;
  dv: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  province: string;
  district: string;
  notes: string;
};

const EMPTY: FormValues = {
  customer_type: "person",
  name: "",
  legal_name: "",
  identification_type: "",
  identification_number: "",
  dv: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  province: "",
  district: "",
  notes: "",
};

export function CustomerFormModal({
  opened,
  onClose,
  customer,
}: {
  opened: boolean;
  onClose: () => void;
  customer?: Customer | null;
}) {
  const save = useSaveCustomer();
  const editing = Boolean(customer?.id);

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
      form.setValues({ ...EMPTY, ...(customer ?? {}) } as FormValues);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, customer]);

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await save.mutateAsync({
        ...values,
        id: customer?.id,
      } as unknown as Partial<Customer> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Cliente actualizado." : "Cliente creado.",
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
      title={editing ? "Editar cliente" : "Nuevo cliente"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Tipo"
              data={CUSTOMER_TYPE_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps("customer_type")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Nombre"
              withAsterisk
              {...form.getInputProps("name")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Razón social" {...form.getInputProps("legal_name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Tipo de identificación"
              data={ID_TYPE_OPTIONS}
              {...form.getInputProps("identification_type")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Identificación"
              {...form.getInputProps("identification_number")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="DV" {...form.getInputProps("dv")} />
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
            <TextInput label="Provincia" {...form.getInputProps("province")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Distrito" {...form.getInputProps("district")} />
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
