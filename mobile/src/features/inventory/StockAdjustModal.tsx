import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";

import { FormModal, Segmented } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import { font, useTheme } from "../../theme";
import { useAdjustStock, type Product } from "./api";

export function StockAdjustModal({
  visible,
  onClose,
  product,
}: {
  visible: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const { colors } = useTheme();
  const [type, setType] = useState("adjustment_in");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const adjust = useAdjustStock();

  useEffect(() => {
    if (visible) {
      setType("adjustment_in");
      setQuantity("");
      setNotes("");
    }
  }, [visible]);

  const submit = () => {
    if (!product) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0)
      return Alert.alert("Cantidad inválida", "Ingresa una cantidad mayor que cero.");
    adjust.mutate(
      { product: product.id, movement_type: type, quantity: quantity, notes },
      { onSuccess: onClose, onError: (e) => Alert.alert("Error", (e as Error).message) },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Ajustar stock"
      onSubmit={submit}
      submitting={adjust.isPending}
      submitLabel="Aplicar"
    >
      {product ? (
        <Text style={{ fontSize: font.md, color: colors.text, fontWeight: "600" }}>
          {product.name} · stock actual {product.stock_quantity}
        </Text>
      ) : null}
      <Segmented
        label="Tipo de ajuste"
        value={type}
        onChange={setType}
        options={[
          { value: "adjustment_in", label: "Entrada (+)" },
          { value: "adjustment_out", label: "Salida (−)" },
        ]}
      />
      <LabeledInput label="Cantidad" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
