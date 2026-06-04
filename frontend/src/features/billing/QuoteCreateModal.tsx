import {
  ActionIcon,
  Button,
  Divider,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useCustomers } from "../customers/api";
import { useCreateQuote, useUpdateQuote } from "./api";
import { LINE_TYPE_OPTIONS, type Quote } from "./types";

interface LineRow {
  line_type: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
}
interface FormValues {
  customer: string | null;
  issue_date: string;
  expiration_date: string;
  discount_percentage: number | string;
  tax_percentage: number | string;
  notes: string;
  terms: string;
  lines: LineRow[];
}

const EMPTY: FormValues = {
  customer: null,
  issue_date: "",
  expiration_date: "",
  discount_percentage: 0,
  tax_percentage: 0,
  notes: "",
  terms: "",
  lines: [],
};

export function QuoteCreateModal({
  opened,
  onClose,
  quote,
}: {
  opened: boolean;
  onClose: () => void;
  quote?: Quote | null;
}) {
  const create = useCreateQuote();
  const update = useUpdateQuote(quote?.id);
  const customers = useCustomers({});
  const navigate = useNavigate();
  const editing = Boolean(quote?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: { customer: (v) => (v ? null : "Selecciona un cliente.") },
  });

  useEffect(() => {
    if (!opened) return;
    if (quote) {
      form.setValues({
        customer: quote.customer ? String(quote.customer) : null,
        issue_date: quote.issue_date ?? "",
        expiration_date: quote.expiration_date ?? "",
        discount_percentage: Number(quote.discount_percentage ?? 0),
        tax_percentage: Number(quote.tax_percentage ?? 0),
        notes: quote.notes ?? "",
        terms: quote.terms ?? "",
        lines: (quote.lines ?? []).map((l) => ({
          line_type: l.line_type ?? "service",
          description: l.description ?? "",
          quantity: Number(l.quantity ?? 0),
          unit_price: Number(l.unit_price ?? 0),
        })),
      });
    } else {
      form.setValues(EMPTY);
    }
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, quote]);

  const submit = form.onSubmit(async (values) => {
    if (values.lines.length === 0) {
      notifications.show({ color: "red", message: "Agrega al menos una línea." });
      return;
    }
    const payload = {
      customer: Number(values.customer),
      issue_date: values.issue_date || undefined,
      expiration_date: values.expiration_date || null,
      discount_percentage: String(values.discount_percentage || 0),
      tax_percentage: String(values.tax_percentage || 0),
      notes: values.notes,
      terms: values.terms,
      lines: values.lines.map((l) => ({
        line_type: l.line_type,
        description: l.description,
        quantity: String(l.quantity || 0),
        unit_price: String(l.unit_price || 0),
      })),
    };
    try {
      const result = editing
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      notifications.show({
        color: "green",
        message: editing ? "Cotización actualizada." : "Cotización creada.",
      });
      onClose();
      navigate(`/quotes/${result.id}`);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "Editar cotización" : "Nueva cotización"}
      size="xl"
    >
      <form onSubmit={submit}>
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
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Emisión" type="date" {...form.getInputProps("issue_date")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput
              label="Vence"
              type="date"
              {...form.getInputProps("expiration_date")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Descuento %" min={0} decimalScale={2} {...form.getInputProps("discount_percentage")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Impuesto %" min={0} decimalScale={2} {...form.getInputProps("tax_percentage")} />
          </Grid.Col>
        </Grid>

        <Divider
          my="md"
          label={
            <Group gap="xs">
              <Text fw={600}>Conceptos</Text>
              <ActionIcon
                size="sm"
                onClick={() =>
                  form.insertListItem("lines", {
                    line_type: "service",
                    description: "",
                    quantity: 1,
                    unit_price: 0,
                  })
                }
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Group>
          }
        />
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={140}>Tipo</Table.Th>
              <Table.Th>Descripción</Table.Th>
              <Table.Th w={80}>Cant.</Table.Th>
              <Table.Th w={110}>Precio</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {form.values.lines.map((_, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Select
                    data={LINE_TYPE_OPTIONS}
                    allowDeselect={false}
                    {...form.getInputProps(`lines.${i}.line_type`)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput {...form.getInputProps(`lines.${i}.description`)} />
                </Table.Td>
                <Table.Td>
                  <NumberInput min={0} decimalScale={2} {...form.getInputProps(`lines.${i}.quantity`)} />
                </Table.Td>
                <Table.Td>
                  <NumberInput min={0} decimalScale={2} {...form.getInputProps(`lines.${i}.unit_price`)} />
                </Table.Td>
                <Table.Td>
                  <ActionIcon color="red" variant="subtle" onClick={() => form.removeListItem("lines", i)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Textarea label="Notas" mt="md" autosize minRows={2} {...form.getInputProps("notes")} />
        <Textarea label="Términos" mt="sm" autosize minRows={2} {...form.getInputProps("terms")} />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {editing ? "Guardar" : "Crear cotización"}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
