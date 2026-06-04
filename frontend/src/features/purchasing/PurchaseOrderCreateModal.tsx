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

import { useProducts, useSupplierOptions } from "../inventory/api";
import { useCreatePurchaseOrder } from "./api";

interface LineRow {
  product: string | null;
  quantity_ordered: number | string;
  unit_purchase_cost: number | string;
  margin_percentage: number | string;
}
interface CostRow {
  name: string;
  amount: number | string;
}
interface FormValues {
  supplier: string | null;
  order_date: string;
  expected_date: string;
  currency: string;
  shipping_cost: number | string;
  notes: string;
  lines: LineRow[];
  additional_costs: CostRow[];
}

export function PurchaseOrderCreateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const create = useCreatePurchaseOrder();
  const suppliers = useSupplierOptions();
  const products = useProducts({});
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    initialValues: {
      supplier: null,
      order_date: "",
      expected_date: "",
      currency: "USD",
      shipping_cost: 0,
      notes: "",
      lines: [],
      additional_costs: [],
    },
    validate: {
      supplier: (v) => (v ? null : "Selecciona un proveedor."),
    },
  });

  useEffect(() => {
    if (opened) form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const productOptions = (products.data?.results ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.sku} · ${p.name}`,
  }));

  const handleSubmit = form.onSubmit(async (values) => {
    if (values.lines.length === 0) {
      notifications.show({ color: "red", message: "Agrega al menos una línea." });
      return;
    }
    if (values.lines.some((l) => !l.product)) {
      notifications.show({ color: "red", message: "Cada línea requiere un producto." });
      return;
    }
    try {
      const order = await create.mutateAsync({
        supplier: Number(values.supplier),
        order_date: values.order_date || undefined,
        expected_date: values.expected_date || null,
        currency: values.currency,
        shipping_cost: String(values.shipping_cost || 0),
        notes: values.notes,
        lines: values.lines.map((l) => ({
          product: Number(l.product),
          quantity_ordered: String(l.quantity_ordered || 0),
          unit_purchase_cost: String(l.unit_purchase_cost || 0),
          margin_percentage: String(l.margin_percentage || 0),
        })),
        additional_costs: values.additional_costs
          .filter((c) => c.name)
          .map((c) => ({ name: c.name, amount: String(c.amount || 0) })),
      });
      notifications.show({ color: "green", message: "Orden creada." });
      onClose();
      navigate(`/purchasing/${order.id}`);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Nueva orden de compra" size="xl">
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Proveedor"
              withAsterisk
              data={(suppliers.data ?? []).map((s) => ({
                value: String(s.id),
                label: s.name,
              }))}
              searchable
              {...form.getInputProps("supplier")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Fecha" type="date" {...form.getInputProps("order_date")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput
              label="Fecha esperada"
              type="date"
              {...form.getInputProps("expected_date")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Moneda" {...form.getInputProps("currency")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput
              label="Envío"
              min={0}
              decimalScale={2}
              {...form.getInputProps("shipping_cost")}
            />
          </Grid.Col>
        </Grid>

        <Divider
          my="md"
          label={
            <Group gap="xs">
              <Text fw={600}>Líneas</Text>
              <ActionIcon
                size="sm"
                onClick={() =>
                  form.insertListItem("lines", {
                    product: null,
                    quantity_ordered: 1,
                    unit_purchase_cost: 0,
                    margin_percentage: 0,
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
              <Table.Th>Producto</Table.Th>
              <Table.Th w={90}>Cant.</Table.Th>
              <Table.Th w={110}>Costo unit.</Table.Th>
              <Table.Th w={90}>Margen %</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {form.values.lines.map((_, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Select
                    data={productOptions}
                    searchable
                    placeholder="Producto"
                    {...form.getInputProps(`lines.${i}.product`)}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    decimalScale={2}
                    {...form.getInputProps(`lines.${i}.quantity_ordered`)}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    decimalScale={2}
                    {...form.getInputProps(`lines.${i}.unit_purchase_cost`)}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    decimalScale={2}
                    {...form.getInputProps(`lines.${i}.margin_percentage`)}
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => form.removeListItem("lines", i)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Divider
          my="md"
          label={
            <Group gap="xs">
              <Text fw={600}>Costos adicionales</Text>
              <ActionIcon
                size="sm"
                onClick={() =>
                  form.insertListItem("additional_costs", { name: "", amount: 0 })
                }
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Group>
          }
        />
        {form.values.additional_costs.map((_, i) => (
          <Group key={i} mb="xs">
            <TextInput
              placeholder="Concepto (envío, aduana…)"
              style={{ flex: 1 }}
              {...form.getInputProps(`additional_costs.${i}.name`)}
            />
            <NumberInput
              w={140}
              min={0}
              decimalScale={2}
              {...form.getInputProps(`additional_costs.${i}.amount`)}
            />
            <ActionIcon
              color="red"
              variant="subtle"
              onClick={() => form.removeListItem("additional_costs", i)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Crear orden
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
