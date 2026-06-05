import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";

import { FormModal, Picker } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import { colors, font } from "../../theme";
import { formatCurrency } from "../../utils/format";
import { useRecordPayment, type Invoice } from "./api";

const METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "bank_transfer", label: "Transferencia" },
  { value: "yappy", label: "Yappy" },
  { value: "ach", label: "ACH" },
  { value: "card", label: "Tarjeta" },
  { value: "other", label: "Otro" },
];

export function PaymentModal({
  visible,
  onClose,
  invoice,
}: {
  visible: boolean;
  onClose: () => void;
  invoice: Invoice;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const pay = useRecordPayment(invoice.id);

  useEffect(() => {
    if (visible) {
      setAmount(String(invoice.balance_due ?? ""));
      setMethod("cash");
      setReference("");
    }
  }, [visible, invoice.balance_due]);

  const submit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0)
      return Alert.alert("Monto inválido", "Ingresa un monto mayor que cero.");
    pay.mutate(
      { amount, method, reference_number: reference },
      { onSuccess: onClose, onError: (e) => Alert.alert("Error", (e as Error).message) },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Registrar pago"
      onSubmit={submit}
      submitting={pay.isPending}
      submitLabel="Cobrar"
    >
      <Text style={{ fontSize: font.md, color: colors.text, fontWeight: "600" }}>
        Saldo pendiente: {formatCurrency(invoice.balance_due)}
      </Text>
      <LabeledInput label="Monto" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Picker
        label="Método"
        value={method}
        onChange={(v) => setMethod(String(v))}
        options={METHODS}
      />
      <LabeledInput label="Referencia" value={reference} onChangeText={setReference} />
    </FormModal>
  );
}
