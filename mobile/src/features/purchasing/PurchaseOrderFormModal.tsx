import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AddRowButton, FormModal, LineCard, Picker, Segmented } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import type { MoreNav } from "../../navigation/types";
import { useSuppliers } from "../suppliers/api";
import { useCategories, useProductSearch } from "../inventory/api";
import {
  useCreatePurchaseOrder,
  type POCostInput,
  type POLineInput,
} from "./api";

interface LineState {
  mode: "existing" | "new";
  product: number | null;
  new_name: string;
  new_category: number | null;
  new_sku: string;
  quantity_ordered: string;
  unit_purchase_cost: string;
}

const emptyLine = (): LineState => ({
  mode: "existing",
  product: null,
  new_name: "",
  new_category: null,
  new_sku: "",
  quantity_ordered: "1",
  unit_purchase_cost: "0",
});

export function PurchaseOrderFormModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const nav = useNavigation<MoreNav>();
  const create = useCreatePurchaseOrder();
  const suppliers = useSuppliers("");
  const products = useProductSearch("");
  const categories = useCategories();

  const [supplier, setSupplier] = useState<number | null>(null);
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [shipping, setShipping] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [costs, setCosts] = useState<POCostInput[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSupplier(null);
    setOrderDate("");
    setExpectedDate("");
    setCurrency("USD");
    setShipping("0");
    setNotes("");
    setLines([emptyLine()]);
    setCosts([]);
  }, [visible]);

  const updateLine = (i: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateCost = (i: number, patch: Partial<POCostInput>) =>
    setCosts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCost = (i: number) => setCosts((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!supplier) return Alert.alert("Falta el proveedor", "Selecciona un proveedor.");
    if (lines.length === 0) return Alert.alert("Sin líneas", "Agrega al menos una línea.");
    for (const l of lines) {
      if (l.mode === "existing" && l.product == null)
        return Alert.alert("Producto requerido", "Cada línea existente necesita un producto.");
      if (l.mode === "new" && !l.new_name.trim())
        return Alert.alert("Nombre requerido", "Cada producto nuevo necesita un nombre.");
    }
    const payloadLines: POLineInput[] = lines.map((l) => ({
      quantity_ordered: l.quantity_ordered,
      unit_purchase_cost: l.unit_purchase_cost,
      ...(l.mode === "new"
        ? {
            product: null,
            new_product: {
              name: l.new_name.trim(),
              category: l.new_category,
              sku: l.new_sku.trim() || undefined,
            },
          }
        : { product: l.product }),
    }));
    const input = {
      supplier,
      order_date: orderDate || undefined,
      expected_date: expectedDate || null,
      currency: currency || "USD",
      shipping_cost: shipping || "0",
      notes,
      lines: payloadLines,
      additional_costs: costs.filter((c) => c.name.trim()),
    };
    create.mutate(input, {
      onSuccess: (o) => {
        onClose();
        nav.navigate("PurchaseOrderDetail", { id: o.id, title: o.order_number ?? "Orden" });
      },
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  const supplierOptions = (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const productOptions = (products.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.sku} · ${p.name}`,
  }));
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Nueva orden de compra"
      onSubmit={submit}
      submitting={create.isPending}
      submitLabel="Crear"
    >
      <Picker
        label="Proveedor"
        value={supplier}
        onChange={(v) => setSupplier(v as number | null)}
        options={supplierOptions}
      />
      <LabeledInput label="Fecha (YYYY-MM-DD)" value={orderDate} onChangeText={setOrderDate} placeholder="2026-06-05" autoCapitalize="none" />
      <LabeledInput label="Fecha esperada (YYYY-MM-DD)" value={expectedDate} onChangeText={setExpectedDate} placeholder="opcional" autoCapitalize="none" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Moneda" value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Envío" value={shipping} onChangeText={setShipping} keyboardType="decimal-pad" />
        </View>
      </View>

      <SectionTitle>Líneas</SectionTitle>
      {lines.map((l, i) => (
        <LineCard key={i} title={`Línea ${i + 1}`} onRemove={() => removeLine(i)}>
          <Segmented
            value={l.mode}
            onChange={(v) => updateLine(i, { mode: v })}
            options={[
              { value: "existing", label: "Existente" },
              { value: "new", label: "Nuevo" },
            ]}
          />
          {l.mode === "existing" ? (
            <Picker
              label="Producto"
              value={l.product}
              onChange={(v) => updateLine(i, { product: v as number | null })}
              options={productOptions}
            />
          ) : (
            <>
              <LabeledInput
                label="Nombre del producto"
                value={l.new_name}
                onChangeText={(t) => updateLine(i, { new_name: t })}
              />
              <Picker
                label="Categoría"
                value={l.new_category}
                onChange={(v) => updateLine(i, { new_category: v as number | null })}
                options={categoryOptions}
                clearable
                placeholder="Sin categoría"
              />
              <LabeledInput
                label="SKU (opcional)"
                value={l.new_sku}
                onChangeText={(t) => updateLine(i, { new_sku: t })}
                placeholder="auto"
                autoCapitalize="characters"
              />
            </>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Cantidad" value={l.quantity_ordered} onChangeText={(t) => updateLine(i, { quantity_ordered: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Costo unit." value={l.unit_purchase_cost} onChangeText={(t) => updateLine(i, { unit_purchase_cost: t })} keyboardType="decimal-pad" />
            </View>
          </View>
        </LineCard>
      ))}
      <AddRowButton label="Agregar línea" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <SectionTitle>Costos adicionales</SectionTitle>
      {costs.map((c, i) => (
        <LineCard key={i} title={`Costo ${i + 1}`} onRemove={() => removeCost(i)}>
          <LabeledInput label="Concepto" value={c.name} onChangeText={(t) => updateCost(i, { name: t })} placeholder="Envío, aduana…" />
          <LabeledInput label="Monto" value={c.amount} onChangeText={(t) => updateCost(i, { amount: t })} keyboardType="decimal-pad" />
        </LineCard>
      ))}
      <AddRowButton label="Agregar costo" onPress={() => setCosts((prev) => [...prev, { name: "", amount: "0" }])} />

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
