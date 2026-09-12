import {
  Button,
  Grid,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { formatCurrency } from "../../utils/format";
import { useEquipmentTypes } from "../equipment/api";
import { useCategories, useSaveProduct, useSupplierOptions } from "./api";
import { computeRange } from "./priceRange";
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
  average_cost: number | string;
  default_margin_percentage: number | string;
  min_margin_percentage: number | string;
  max_margin_percentage: number | string;
  main_supplier: string | null;
  compatible_equipment_types: string[];
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
  average_cost: 0,
  default_margin_percentage: 0,
  min_margin_percentage: 0,
  max_margin_percentage: 0,
  main_supplier: null,
  compatible_equipment_types: [],
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
      min_margin_percentage: (value, values) =>
        Number(value) > 0 && Number(values.max_margin_percentage) > 0
          && Number(value) > Number(values.max_margin_percentage)
          ? "El margen mínimo no puede superar al máximo."
          : null,
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
      // average_cost sólo alimenta la vista previa del rango; el backend lo deriva
      // de los movimientos de inventario y no debe recibirlo desde este formulario.
      average_cost: undefined,
      id: product?.id,
      category: values.category ? Number(values.category) : null,
      main_supplier: values.main_supplier ? Number(values.main_supplier) : null,
      compatible_equipment_types: values.compatible_equipment_types.map(Number),
      minimum_stock: String(values.minimum_stock || 0),
      sale_price: String(values.sale_price || 0),
      default_margin_percentage: String(values.default_margin_percentage || 0),
      min_margin_percentage: String(values.min_margin_percentage || 0),
      max_margin_percentage: String(values.max_margin_percentage || 0),
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
            <TextInput label="Nombre" withAsterisk {...form.getInputProps("name")} />
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
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Margen mínimo %"
              min={0}
              decimalScale={2}
              {...form.getInputProps("min_margin_percentage")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Margen máximo %"
              min={0}
              decimalScale={2}
              {...form.getInputProps("max_margin_percentage")}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            {(() => {
              const range = computeRange(
                Number(form.values.average_cost ?? 0),
                Number(form.values.min_margin_percentage ?? 0),
                Number(form.values.default_margin_percentage ?? 0),
                Number(form.values.max_margin_percentage ?? 0),
              );
              if (!range.suggested) return null;
              return (
                <Text size="xs" c="dimmed">
                  Rango sobre el costo promedio: piso {formatCurrency(range.floor)} · sugerido{" "}
                  {formatCurrency(range.suggested)} · techo {formatCurrency(range.ceiling)}
                </Text>
              );
            })()}
          </Grid.Col>
          <Grid.Col span={12}>
            <MultiSelect
              label="Modelos compatibles"
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
