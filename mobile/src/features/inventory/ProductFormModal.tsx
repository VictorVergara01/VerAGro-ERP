import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { FormModal, Picker } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import {
  ProductInput,
  useCategories,
  useSaveProduct,
  type Product,
} from "./api";

const EMPTY: ProductInput = {
  sku: "",
  name: "",
  category: null,
  brand: "",
  model: "",
  unit_of_measure: "",
  location: "",
  minimum_stock: "0",
  sale_price: "0",
  default_margin_percentage: "0",
};

export function ProductFormModal({
  visible,
  onClose,
  product,
}: {
  visible: boolean;
  onClose: () => void;
  product?: Product | null;
}) {
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const save = useSaveProduct();
  const categories = useCategories();

  useEffect(() => {
    if (visible) {
      setForm(
        product
          ? {
              sku: product.sku ?? "",
              name: product.name ?? "",
              category: product.category ?? null,
              brand: product.brand ?? "",
              model: product.model ?? "",
              unit_of_measure: product.unit_of_measure ?? "",
              location: product.location ?? "",
              minimum_stock: String(product.minimum_stock ?? "0"),
              sale_price: String(product.sale_price ?? "0"),
              default_margin_percentage: String(product.default_margin_percentage ?? "0"),
            }
          : EMPTY,
      );
    }
  }, [visible, product]);

  const set = (k: keyof ProductInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.sku.trim() || !form.name.trim())
      return Alert.alert("Faltan datos", "SKU y nombre son obligatorios.");
    save.mutate(
      { id: product?.id, input: form },
      { onSuccess: onClose, onError: (e) => Alert.alert("Error", (e as Error).message) },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      onSubmit={submit}
      submitting={save.isPending}
    >
      <LabeledInput label="SKU" value={form.sku} onChangeText={set("sku")} autoCapitalize="characters" />
      <LabeledInput label="Nombre" value={form.name} onChangeText={set("name")} />
      <Picker
        label="Categoría"
        value={form.category}
        onChange={(v) => setForm((f) => ({ ...f, category: v as number | null }))}
        options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        clearable
      />
      <LabeledInput label="Marca" value={form.brand} onChangeText={set("brand")} />
      <LabeledInput label="Modelo" value={form.model} onChangeText={set("model")} />
      <LabeledInput label="Unidad de medida" value={form.unit_of_measure} onChangeText={set("unit_of_measure")} />
      <LabeledInput label="Ubicación" value={form.location} onChangeText={set("location")} />
      <LabeledInput label="Stock mínimo" value={form.minimum_stock} onChangeText={set("minimum_stock")} keyboardType="numeric" />
      <LabeledInput label="Precio de venta" value={form.sale_price} onChangeText={set("sale_price")} keyboardType="numeric" />
      <LabeledInput label="Margen %" value={form.default_margin_percentage} onChangeText={set("default_margin_percentage")} keyboardType="numeric" />
    </FormModal>
  );
}
