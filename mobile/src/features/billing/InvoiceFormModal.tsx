import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AddRowButton, FormModal, LineCard, Picker } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import type { MoreNav } from "../../navigation/types";
import { useCustomers } from "../customers/api";
import { useProductSearch } from "../inventory/api";
import {
  INVOICE_TYPE_OPTIONS,
  LINE_TYPE_OPTIONS,
  useCreateInvoice,
  useUpdateInvoice,
  type Invoice,
  type InvoiceLineInput,
} from "./api";

const emptyLine = (): InvoiceLineInput => ({
  line_type: "product",
  product: null,
  description: "",
  quantity: "1",
  unit_price: "0",
  unit_cost: "0",
});

export function InvoiceFormModal({
  visible,
  onClose,
  invoice,
}: {
  visible: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
}) {
  const nav = useNavigation<MoreNav>();
  const editing = Boolean(invoice?.id);
  const create = useCreateInvoice();
  const update = useUpdateInvoice(invoice?.id);
  const customers = useCustomers("");
  const products = useProductSearch("");

  const [customer, setCustomer] = useState<number | null>(null);
  const [invoiceType, setInvoiceType] = useState("product_sale");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLineInput[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (invoice) {
      setCustomer(invoice.customer ?? null);
      setInvoiceType(invoice.invoice_type ?? "product_sale");
      setIssueDate(invoice.issue_date ?? "");
      setDueDate(invoice.due_date ?? "");
      setDiscount(String(invoice.discount_percentage ?? "0"));
      setTax(String(invoice.tax_percentage ?? "0"));
      setNotes(invoice.notes ?? "");
      setLines(
        (invoice.lines ?? []).map((l) => ({
          line_type: l.line_type ?? "product",
          product: l.product ?? null,
          description: l.description ?? "",
          quantity: String(l.quantity ?? "0"),
          unit_price: String(l.unit_price ?? "0"),
          unit_cost: String(l.unit_cost ?? "0"),
        })),
      );
    } else {
      setCustomer(null);
      setInvoiceType("product_sale");
      setIssueDate("");
      setDueDate("");
      setDiscount("0");
      setTax("0");
      setNotes("");
      setLines([emptyLine()]);
    }
  }, [visible, invoice]);

  const updateLine = (i: number, patch: Partial<InvoiceLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const onPickProduct = (i: number, value: number | null) => {
    const p = (products.data ?? []).find((x) => x.id === value);
    updateLine(i, {
      product: value,
      ...(p
        ? {
            line_type: "product",
            description: p.name ?? "",
            unit_price: String(p.sale_price ?? "0"),
            unit_cost: String(p.average_cost ?? "0"),
          }
        : {}),
    });
  };

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    if (lines.length === 0) return Alert.alert("Sin líneas", "Agrega al menos una línea.");
    const input = {
      customer,
      invoice_type: invoiceType,
      issue_date: issueDate || undefined,
      due_date: dueDate || null,
      discount_percentage: discount || "0",
      tax_percentage: tax || "0",
      notes,
      lines,
    };
    const onError = (e: unknown) => Alert.alert("Error", (e as Error).message);
    if (editing) {
      update.mutate(input, { onSuccess: onClose, onError });
    } else {
      create.mutate(input, {
        onSuccess: (inv) => {
          onClose();
          nav.navigate("InvoiceDetail", { id: inv.id, title: inv.invoice_number ?? "Factura" });
        },
        onError,
      });
    }
  };

  const customerOptions = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const productOptions = (products.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.sku} · ${p.name}`,
  }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={editing ? "Editar factura" : "Nueva factura"}
      onSubmit={submit}
      submitting={create.isPending || update.isPending}
      submitLabel={editing ? "Guardar" : "Crear"}
    >
      <Picker
        label="Cliente"
        value={customer}
        onChange={(v) => setCustomer(v as number | null)}
        options={customerOptions}
      />
      <Picker
        label="Tipo de factura"
        value={invoiceType}
        onChange={(v) => setInvoiceType(String(v))}
        options={INVOICE_TYPE_OPTIONS}
      />
      <LabeledInput label="Emisión (YYYY-MM-DD)" value={issueDate} onChangeText={setIssueDate} placeholder="2026-06-05" autoCapitalize="none" />
      <LabeledInput label="Vence (YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="opcional" autoCapitalize="none" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Descuento %" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Impuesto %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" />
        </View>
      </View>

      <SectionTitle>Conceptos</SectionTitle>
      {lines.map((l, i) => (
        <LineCard key={i} title={`Línea ${i + 1}`} onRemove={() => removeLine(i)}>
          <Picker
            label="Producto (opcional)"
            value={l.product}
            onChange={(v) => onPickProduct(i, v as number | null)}
            options={productOptions}
            clearable
            placeholder="Sin producto"
          />
          <Picker
            label="Tipo"
            value={l.line_type}
            onChange={(v) => updateLine(i, { line_type: String(v) })}
            options={LINE_TYPE_OPTIONS}
          />
          <LabeledInput
            label="Descripción"
            value={l.description}
            onChangeText={(t) => updateLine(i, { description: t })}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Cantidad" value={l.quantity} onChangeText={(t) => updateLine(i, { quantity: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Precio" value={l.unit_price} onChangeText={(t) => updateLine(i, { unit_price: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Costo" value={l.unit_cost} onChangeText={(t) => updateLine(i, { unit_cost: t })} keyboardType="decimal-pad" />
            </View>
          </View>
        </LineCard>
      ))}
      <AddRowButton label="Agregar línea" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
