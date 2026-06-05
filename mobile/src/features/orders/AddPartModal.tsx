import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { useProductSearch, type Product } from "../inventory/api";
import { useAddPart } from "./api";

export function AddPartModal({
  visible,
  onClose,
  orderId,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: number;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1");
  const products = useProductSearch(search);
  const addPart = useAddPart(orderId);

  const reset = () => {
    setSearch("");
    setSelected(null);
    setQuantity("1");
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    if (!selected) return;
    const q = Number(quantity);
    if (!q || q <= 0) return;
    addPart.mutate(
      { product: selected.id, quantity: String(q) },
      {
        onSuccess: close,
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Agregar pieza</Text>
          <TouchableOpacity onPress={close}>
            <Text style={styles.cancel}>Cerrar</Text>
          </TouchableOpacity>
        </View>

        {selected ? (
          <View style={styles.selectedBox}>
            <Text style={styles.selectedName}>
              {selected.sku} · {selected.name}
            </Text>
            <Text style={styles.label}>Cantidad</Text>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              value={quantity}
              onChangeText={setQuantity}
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setSelected(null)}>
                <Text style={styles.secondaryText}>Cambiar producto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, addPart.isPending && styles.disabled]}
                onPress={submit}
                disabled={addPart.isPending}
              >
                {addPart.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Agregar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por SKU o nombre"
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {products.isLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
            ) : (
              <FlatList
                data={products.data ?? []}
                keyExtractor={(p) => String(p.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.productRow}
                    onPress={() => setSelected(item)}
                  >
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.productMeta}>
                      {item.sku} · disp. {item.available_quantity ?? item.stock_quantity}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.empty}>Sin resultados.</Text>
                }
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  cancel: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: colors.card,
    marginBottom: 8,
  },
  productRow: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  productName: { fontSize: 15, fontWeight: "500", color: colors.text },
  productMeta: { fontSize: 13, color: colors.dimmed, marginTop: 2 },
  empty: { textAlign: "center", color: colors.dimmed, marginTop: 24 },
  selectedBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedName: { fontSize: 16, fontWeight: "600", color: colors.text },
  label: { color: colors.dimmed, fontSize: 13, marginTop: 14, marginBottom: 6 },
  qtyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: colors.card,
    width: 120,
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 20 },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.7 },
});
