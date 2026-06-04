import {
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { useProducts } from "../inventory/api";
import { useSaveSupplierProduct } from "./api";
import type { SupplierProduct } from "./types";

interface FormValues {
  product: string | null;
  supplier_sku: string;
  last_cost: number | string;
  currency: string;
  minimum_order_quantity: number | string;
  is_preferred: boolean;
}

export function SupplierProductModal({
  opened,
  onClose,
  supplierId,
  item,
}: {
  opened: boolean;
  onClose: () => void;
  supplierId: number;
  item?: SupplierProduct | null;
}) {
  const save = useSaveSupplierProduct();
  const products = useProducts({});
  const editing = Boolean(item?.id);

  const form = useForm<FormValues>({
    initialValues: {
      product: null,
      supplier_sku: "",
      last_cost: 0,
      currency: "USD",
      minimum_order_quantity: 0,
      is_preferred: false,
    },
    validate: {
      product: (v) => (v ? null : "Selecciona un producto."),
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        product: item?.product ? String(item.product) : null,
        supplier_sku: item?.supplier_sku ?? "",
        last_cost: item?.last_cost ?? 0,
        currency: item?.currency ?? "USD",
        minimum_order_quantity: item?.minimum_order_quantity ?? 0,
        is_preferred: item?.is_preferred ?? false,
      });
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, item]);

  const handleSubmit = form.onSubmit(async (values) => {
    const payload = {
      id: item?.id,
      supplier: supplierId,
      product: Number(values.product),
      supplier_sku: values.supplier_sku,
      last_cost: String(values.last_cost || 0),
      currency: values.currency,
      minimum_order_quantity: String(values.minimum_order_quantity || 0),
      is_preferred: values.is_preferred,
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<SupplierProduct> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Relación actualizada." : "Producto asociado.",
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
      title={editing ? "Editar producto del proveedor" : "Asociar producto"}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={12}>
            <Select
              label="Producto"
              withAsterisk
              data={(products.data?.results ?? []).map((p) => ({
                value: String(p.id),
                label: `${p.sku} · ${p.name}`,
              }))}
              searchable
              disabled={editing}
              {...form.getInputProps("product")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="SKU del proveedor" {...form.getInputProps("supplier_sku")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput
              label="Último costo"
              min={0}
              decimalScale={2}
              {...form.getInputProps("last_cost")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="Moneda" {...form.getInputProps("currency")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Cantidad mínima de pedido"
              min={0}
              decimalScale={2}
              {...form.getInputProps("minimum_order_quantity")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }} mt="lg">
            <Switch
              label="Proveedor preferido"
              {...form.getInputProps("is_preferred", { type: "checkbox" })}
            />
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
