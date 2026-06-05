import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AddRowButton, FormModal, LineCard, Picker } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import type { MoreNav } from "../../navigation/types";
import { useCustomers } from "../customers/api";
import {
  LINE_TYPE_OPTIONS,
  useCreateQuote,
  useUpdateQuote,
  type Quote,
  type QuoteLineInput,
} from "./api";

const emptyLine = (): QuoteLineInput => ({
  line_type: "service",
  description: "",
  quantity: "1",
  unit_price: "0",
});

export function QuoteFormModal({
  visible,
  onClose,
  quote,
}: {
  visible: boolean;
  onClose: () => void;
  quote?: Quote | null;
}) {
  const nav = useNavigation<MoreNav>();
  const editing = Boolean(quote?.id);
  const create = useCreateQuote();
  const update = useUpdateQuote(quote?.id);
  const customers = useCustomers("");

  const [customer, setCustomer] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<QuoteLineInput[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (quote) {
      setCustomer(quote.customer ?? null);
      setIssueDate(quote.issue_date ?? "");
      setExpirationDate(quote.expiration_date ?? "");
      setDiscount(String(quote.discount_percentage ?? "0"));
      setTax(String(quote.tax_percentage ?? "0"));
      setNotes(quote.notes ?? "");
      setTerms(quote.terms ?? "");
      setLines(
        (quote.lines ?? []).map((l) => ({
          line_type: l.line_type ?? "service",
          description: l.description ?? "",
          quantity: String(l.quantity ?? "0"),
          unit_price: String(l.unit_price ?? "0"),
        })),
      );
    } else {
      setCustomer(null);
      setIssueDate("");
      setExpirationDate("");
      setDiscount("0");
      setTax("0");
      setNotes("");
      setTerms("");
      setLines([emptyLine()]);
    }
  }, [visible, quote]);

  const updateLine = (i: number, patch: Partial<QuoteLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    if (lines.length === 0) return Alert.alert("Sin líneas", "Agrega al menos una línea.");
    const input = {
      customer,
      issue_date: issueDate || undefined,
      expiration_date: expirationDate || null,
      discount_percentage: discount || "0",
      tax_percentage: tax || "0",
      notes,
      terms,
      lines,
    };
    const onError = (e: unknown) => Alert.alert("Error", (e as Error).message);
    if (editing) {
      update.mutate(input, { onSuccess: onClose, onError });
    } else {
      create.mutate(input, {
        onSuccess: (q) => {
          onClose();
          nav.navigate("QuoteDetail", { id: q.id, title: q.quote_number ?? "Cotización" });
        },
        onError,
      });
    }
  };

  const customerOptions = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={editing ? "Editar cotización" : "Nueva cotización"}
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
      <LabeledInput
        label="Emisión (YYYY-MM-DD)"
        value={issueDate}
        onChangeText={setIssueDate}
        placeholder="2026-06-05"
        autoCapitalize="none"
      />
      <LabeledInput
        label="Vence (YYYY-MM-DD)"
        value={expirationDate}
        onChangeText={setExpirationDate}
        placeholder="opcional"
        autoCapitalize="none"
      />
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
          </View>
        </LineCard>
      ))}
      <AddRowButton label="Agregar línea" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
      <LabeledInput label="Términos" value={terms} onChangeText={setTerms} multiline />
    </FormModal>
  );
}
