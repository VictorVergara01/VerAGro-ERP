import {
  Button,
  Grid,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { useEquipmentTypes } from "../equipment/api";
import { useCategories, useSaveProduct, useSupplierOptions } from "./api";
import type { Product } from "./types";

interface FormValues {
  sku: string;
  name: string;
  category: string | null;
  brand: string;
  model: string;
  unit_of_measure: string;
  barcode: string;
  location: string;
  minimum_stock: number | string;
  sale_price: number | string;
  default_margin_percentage: number | string;
  main_supplier: string | null;
  compatible_equipment_types: string[];
  compatible_models: string;
  description: string;
}

const EMPTY: FormValues = {
  sku: "",
  name: "",
  category: null,
  brand: "",
  model: "",
  unit_of_measure: "",
  barcode: "",
  location: "",
  minimum_stock: 0,
  sale_price: 0,
  default_margin_percentage: 0,
  main_supplier: null,
  compatible_equipment_types: [],
  compatible_models: "",
  description: "",
};

export function ProductFormModal({
  opened,
  onClose,
  product,
}: {
  opened: boolean;
  onClose: () => void;
  product?: Product | null;
}) {
  const save = useSaveProduct();
  const categories = useCategories();
  const suppliers = useSupplierOptions();
  const types = useEquipmentTypes();
  const editing = Boolean(product?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      name: (v) => (v.trim() ? null : "El nombre es obligatorio."),
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        ...EMPTY,
        ...(product
          ? {
              ...product,
              category: product.category ? String(product.category) : null,
              main_supplier: product.main_supplier
                ? String(product.main_supplier)
                : null,
              compatible_equipment_types: (
                product.compatible_equipment_types ?? []
              ).map(String),
            }
          : {}),
      } as FormValues);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, product]);

  const handleSubmit = form.onSubmit(async (values) => {
    const payload = {
      ...values,
      id: product?.id,
      category: values.category ? Number(values.category) : null,
      main_supplier: values.main_supplier ? Number(values.main_supplier) : null,
      compatible_equipment_types: values.compatible_equipment_types.map(Number),
      minimum_stock: String(values.minimum_stock || 0),
      sale_price: String(values.sale_price || 0),
      default_margin_percentage: String(values.default_margin_percentage || 0),
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<Product> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Producto actualizado." : "Producto creado.",
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
      title={editing ? "Editar producto" : "Nuevo producto"}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="SKU"
              placeholder="Déjalo vacío para generar automáticamente"
              {...form.getInputProps("sku")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Nombre" {...form.getInputProps("name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Categoría"
              data={(categories.data ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
              searchable
              clearable
              {...form.getInputProps("category")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Proveedor principal"
              data={(suppliers.data ?? []).map((s) => ({
                value: String(s.id),
                label: s.name,
              }))}
              searchable
              clearable
              {...form.getInputProps("main_supplier")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="Marca" {...form.getInputProps("brand")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="Modelo" {...form.getInputProps("model")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="Unidad" {...form.getInputProps("unit_of_measure")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="Código de barras" {...form.getInputProps("barcode")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="Ubicación" {...form.getInputProps("location")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Stock mínimo"
              min={0}
              decimalScale={2}
              {...form.getInputProps("minimum_stock")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Precio de venta"
              min={0}
              decimalScale={2}
              {...form.getInputProps("sale_price")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Margen % por defecto"
              min={0}
              decimalScale={2}
              {...form.getInputProps("default_margin_percentage")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <MultiSelect
              label="Equipos compatibles"
              data={(types.data ?? []).map((t) => ({
                value: String(t.id),
                label: t.name,
              }))}
              searchable
              {...form.getInputProps("compatible_equipment_types")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Modelos compatibles"
              autosize
              minRows={2}
              {...form.getInputProps("compatible_models")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Descripción"
              autosize
              minRows={2}
              {...form.getInputProps("description")}
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
