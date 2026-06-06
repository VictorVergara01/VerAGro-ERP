import {
  Button,
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
import { useEffect } from "react";

import { useCategories, useProducts } from "../inventory/api";
import { useAddOrderLine, useUpdateOrderLine, type CreateLineInput } from "./api";
import type { PurchaseOrderLine } from "./types";

interface FormValues {
  mode: "existing" | "new";
  product: string | null;
  new_name: string;
  new_category: string | null;
  new_sku: string;
  quantity_ordered: number | string;
  unit_purchase_cost: number | string;
}

const initial: FormValues = {
  mode: "existing",
  product: null,
  new_name: "",
  new_category: null,
  new_sku: "",
  quantity_ordered: 1,
  unit_purchase_cost: 0,
};

export function AddLineModal({
  opened,
  onClose,
  orderId,
  line,
}: {
  opened: boolean;
  onClose: () => void;
  orderId: number | undefined;
  /** Si viene, el modal edita esa línea (solo cantidad/costo). */
  line?: PurchaseOrderLine | null;
}) {
  const addLine = useAddOrderLine(orderId);
  const updateLine = useUpdateOrderLine(orderId);
  const products = useProducts({});
  const categories = useCategories();
  const isEdit = !!line;

  const form = useForm<FormValues>({ initialValues: initial });

  useEffect(() => {
    if (!opened) return;
    if (line) {
      form.setValues({
        ...initial,
        product: line.product != null ? String(line.product) : null,
        quantity_ordered: Number(line.quantity_ordered),
        unit_purchase_cost: Number(line.unit_purchase_cost),
      });
    } else {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, line]);

  const productOptions = (products.data?.results ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.sku} · ${p.name}`,
  }));
  const categoryOptions = (categories.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const handleSubmit = form.onSubmit(async (values) => {
    const quantity_ordered = String(values.quantity_ordered || 0);
    const unit_purchase_cost = String(values.unit_purchase_cost || 0);

    if (isEdit && line) {
      try {
        await updateLine.mutateAsync({ id: line.id, quantity_ordered, unit_purchase_cost });
        notifications.show({ color: "green", message: "Producto actualizado." });
        onClose();
      } catch (e) {
        notifications.show({ color: "red", message: (e as Error).message });
      }
      return;
    }

    if (values.mode === "existing" && !values.product) {
      notifications.show({ color: "red", message: "Selecciona un producto." });
      return;
    }
    if (values.mode === "new" && !values.new_name.trim()) {
      notifications.show({ color: "red", message: "El producto nuevo requiere un nombre." });
      return;
    }
    const input: CreateLineInput = {
      quantity_ordered,
      unit_purchase_cost,
      ...(values.mode === "new"
        ? {
            new_product: {
              name: values.new_name.trim(),
              category: values.new_category ? Number(values.new_category) : null,
              sku: values.new_sku.trim() || undefined,
            },
          }
        : { product: Number(values.product) }),
    };
    try {
      await addLine.mutateAsync(input);
      notifications.show({ color: "green", message: "Producto agregado." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Editar producto de la orden" : "Agregar producto a la orden"}
    >
      <form onSubmit={handleSubmit}>
        <Stack>
          {isEdit ? (
            <Text fw={600}>{line?.product_name}</Text>
          ) : (
            <>
              <SegmentedControl
                fullWidth
                data={[
                  { value: "existing", label: "Existente" },
                  { value: "new", label: "Nuevo" },
                ]}
                {...form.getInputProps("mode")}
              />

              {form.values.mode === "existing" ? (
                <Select
                  label="Producto"
                  data={productOptions}
                  searchable
                  placeholder="Selecciona un producto"
                  {...form.getInputProps("product")}
                />
              ) : (
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label="Nombre" {...form.getInputProps("new_name")} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, sm: 4 }}>
                    <Select
                      label="Categoría"
                      data={categoryOptions}
                      searchable
                      clearable
                      placeholder="—"
                      {...form.getInputProps("new_category")}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 4, sm: 2 }}>
                    <TextInput label="SKU" placeholder="auto" {...form.getInputProps("new_sku")} />
                  </Grid.Col>
                </Grid>
              )}
            </>
          )}

          <Group grow>
            <NumberInput
              label="Cantidad"
              min={0}
              decimalScale={2}
              {...form.getInputProps("quantity_ordered")}
            />
            <NumberInput
              label="Costo unit."
              min={0}
              decimalScale={2}
              {...form.getInputProps("unit_purchase_cost")}
            />
          </Group>

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={addLine.isPending || updateLine.isPending}>
              {isEdit ? "Guardar" : "Agregar"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
