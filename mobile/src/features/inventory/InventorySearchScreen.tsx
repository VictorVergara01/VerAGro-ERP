import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors } from "../../theme";
import { formatCurrency } from "../../utils/format";
import { useProductSearch } from "./api";

export function InventorySearchScreen() {
  const [search, setSearch] = useState("");
  const products = useProductSearch(search);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Buscar por SKU, nombre, marca…"
        value={search}
        onChangeText={setSearch}
        autoFocus
      />
      {products.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={products.data ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const available = item.available_quantity ?? item.stock_quantity;
            const low =
              Number(available) <= Number(item.minimum_stock) &&
              Number(item.minimum_stock) > 0;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.price}>{formatCurrency(item.sale_price)}</Text>
                </View>
                <Text style={styles.meta}>{item.sku}</Text>
                <View style={styles.stockRow}>
                  <Text style={styles.stock}>
                    Stock: {item.stock_quantity} · Disp:{" "}
                    <Text style={low ? styles.lowStock : undefined}>{available}</Text>
                  </Text>
                  {item.location ? (
                    <Text style={styles.location}>{item.location}</Text>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? "Sin resultados." : "Escribe para buscar."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  list: { paddingTop: 12, gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontSize: 15, fontWeight: "600", color: colors.text, flexShrink: 1 },
  price: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.dimmed, marginTop: 2 },
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  stock: { fontSize: 13, color: colors.text },
  lowStock: { color: colors.danger, fontWeight: "700" },
  location: { fontSize: 12, color: colors.dimmed },
  empty: { textAlign: "center", color: colors.dimmed, marginTop: 32 },
});
