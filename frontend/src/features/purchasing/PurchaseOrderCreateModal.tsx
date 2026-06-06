import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useCategories, useProducts, useSupplierOptions } from "../inventory/api";
import { useCreatePurchaseOrder, type CreateLineInput } from "./api";

interface LineRow {
  mode: "existing" | "new";
  product: string | null;
  new_name: string;
  new_category: string | null;
  new_sku: string;
  quantity_ordered: number | string;
  unit_purchase_cost: number | string;
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

const emptyLine = (): LineRow => ({
  mode: "existing",
  product: null,
  new_name: "",
  new_category: null,
  new_sku: "",
  quantity_ordered: 1,
  unit_purchase_cost: 0,
});

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
  const categories = useCategories();
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
  const categoryOptions = (categories.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const handleSubmit = form.onSubmit(async (values) => {
    if (values.lines.length === 0) {
      notifications.show({ color: "red", message: "Agrega al menos una línea." });
      return;
    }
    for (const l of values.lines) {
      if (l.mode === "existing" && !l.product) {
        notifications.show({ color: "red", message: "Cada línea existente requiere un producto." });
        return;
      }
      if (l.mode === "new" && !l.new_name.trim()) {
        notifications.show({ color: "red", message: "Cada producto nuevo requiere un nombre." });
        return;
      }
    }
    try {
      const lines: CreateLineInput[] = values.lines.map((l) => ({
        quantity_ordered: String(l.quantity_ordered || 0),
        unit_purchase_cost: String(l.unit_purchase_cost || 0),
        ...(l.mode === "new"
          ? {
              new_product: {
                name: l.new_name.trim(),
                category: l.new_category ? Number(l.new_category) : null,
                sku: l.new_sku.trim() || undefined,
              },
            }
          : { product: Number(l.product) }),
      }));
      const order = await create.mutateAsync({
        supplier: Number(values.supplier),
        order_date: values.order_date || undefined,
        expected_date: values.expected_date || null,
        currency: values.currency,
        shipping_cost: String(values.shipping_cost || 0),
        notes: values.notes,
        lines,
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
              <ActionIcon size="sm" onClick={() => form.insertListItem("lines", emptyLine())}>
                <IconPlus size={16} />
              </ActionIcon>
            </Group>
          }
        />
        <Stack gap="sm">
          {form.values.lines.map((line, i) => (
            <Card key={i} withBorder padding="sm">
              <Group justify="space-between" mb="xs">
                <SegmentedControl
                  size="xs"
                  data={[
                    { value: "existing", label: "Existente" },
                    { value: "new", label: "Nuevo" },
                  ]}
                  {...form.getInputProps(`lines.${i}.mode`)}
                />
                <ActionIcon color="red" variant="subtle" onClick={() => form.removeListItem("lines", i)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              {line.mode === "existing" ? (
                <Select
                  label="Producto"
                  data={productOptions}
                  searchable
                  placeholder="Selecciona un producto"
                  {...form.getInputProps(`lines.${i}.product`)}
                />
              ) : (
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label="Nombre" {...form.getInputProps(`lines.${i}.new_name`)} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, sm: 4 }}>
                    <Select
                      label="Categoría"
                      data={categoryOptions}
                      searchable
                      clearable
                      placeholder="—"
                      {...form.getInputProps(`lines.${i}.new_category`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 4, sm: 2 }}>
                    <TextInput label="SKU" placeholder="auto" {...form.getInputProps(`lines.${i}.new_sku`)} />
                  </Grid.Col>
                </Grid>
              )}

              <Group mt="xs" grow>
                <NumberInput
                  label="Cantidad"
                  min={0}
                  decimalScale={2}
                  {...form.getInputProps(`lines.${i}.quantity_ordered`)}
                />
                <NumberInput
                  label="Costo unit."
                  min={0}
                  decimalScale={2}
                  {...form.getInputProps(`lines.${i}.unit_purchase_cost`)}
                />
              </Group>
            </Card>
          ))}
        </Stack>

        <Divider
          my="md"
          label={
            <Group gap="xs">
              <Text fw={600}>Costos adicionales</Text>
              <ActionIcon
                size="sm"
                onClick={() => form.insertListItem("additional_costs", { name: "", amount: 0 })}
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
