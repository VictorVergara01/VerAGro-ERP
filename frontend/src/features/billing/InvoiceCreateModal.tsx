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
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useCustomers } from "../customers/api";
import { useProducts } from "../inventory/api";
import { useCreateInvoice } from "./api";
import { INVOICE_TYPE_OPTIONS, LINE_TYPE_OPTIONS } from "./types";

interface LineRow {
  line_type: string;
  product: string | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  unit_cost: number | string;
}
interface FormValues {
  customer: string | null;
  invoice_type: string;
  issue_date: string;
  due_date: string;
  discount_amount: number | string;
  tax_amount: number | string;
  notes: string;
  lines: LineRow[];
}

export function InvoiceCreateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const create = useCreateInvoice();
  const customers = useCustomers({});
  const products = useProducts({});
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    initialValues: {
      customer: null,
      invoice_type: "product_sale",
      issue_date: "",
      due_date: "",
      discount_amount: 0,
      tax_amount: 0,
      notes: "",
      lines: [],
    },
    validate: { customer: (v) => (v ? null : "Selecciona un cliente.") },
  });

  useEffect(() => {
    if (opened) form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const productOptions = (products.data?.results ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.sku} · ${p.name}`,
  }));

  const onPickProduct = (i: number, value: string | null) => {
    form.setFieldValue(`lines.${i}.product`, value);
    const p = products.data?.results.find((x) => String(x.id) === value);
    if (p) {
      form.setFieldValue(`lines.${i}.description`, p.name);
      form.setFieldValue(`lines.${i}.unit_price`, Number(p.sale_price));
      form.setFieldValue(`lines.${i}.unit_cost`, Number(p.average_cost));
      form.setFieldValue(`lines.${i}.line_type`, "product");
    }
  };

  const submit = form.onSubmit(async (values) => {
    if (values.lines.length === 0) {
      notifications.show({ color: "red", message: "Agrega al menos una línea." });
      return;
    }
    try {
      const invoice = await create.mutateAsync({
        customer: Number(values.customer),
        invoice_type: values.invoice_type,
        issue_date: values.issue_date || undefined,
        due_date: values.due_date || null,
        discount_amount: String(values.discount_amount || 0),
        tax_amount: String(values.tax_amount || 0),
        notes: values.notes,
        lines: values.lines.map((l) => ({
          line_type: l.line_type,
          product: l.product ? Number(l.product) : null,
          description: l.description,
          quantity: String(l.quantity || 0),
          unit_price: String(l.unit_price || 0),
          unit_cost: String(l.unit_cost || 0),
        })),
      });
      notifications.show({ color: "green", message: "Factura creada." });
      onClose();
      navigate(`/invoices/${invoice.id}`);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Nueva factura" size="xl">
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
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Tipo de factura"
              data={INVOICE_TYPE_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps("invoice_type")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Emisión" type="date" {...form.getInputProps("issue_date")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Vence" type="date" {...form.getInputProps("due_date")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Descuento" min={0} decimalScale={2} {...form.getInputProps("discount_amount")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Impuesto" min={0} decimalScale={2} {...form.getInputProps("tax_amount")} />
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
                    line_type: "product",
                    product: null,
                    description: "",
                    quantity: 1,
                    unit_price: 0,
                    unit_cost: 0,
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
              <Table.Th w={130}>Tipo</Table.Th>
              <Table.Th w={160}>Producto (opcional)</Table.Th>
              <Table.Th>Descripción</Table.Th>
              <Table.Th w={70}>Cant.</Table.Th>
              <Table.Th w={100}>Precio</Table.Th>
              <Table.Th w={100}>Costo</Table.Th>
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
                  <Select
                    data={productOptions}
                    searchable
                    clearable
                    placeholder="—"
                    value={form.values.lines[i].product}
                    onChange={(v) => onPickProduct(i, v)}
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
                  <NumberInput min={0} decimalScale={2} {...form.getInputProps(`lines.${i}.unit_cost`)} />
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

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Crear factura
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
