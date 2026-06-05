import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { Card, FAB, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import { font, useThemedStyles, type ThemeColors } from "../../theme";
import { formatCurrency } from "../../utils/format";
import { useDeleteProduct, useProductSearch, type Product } from "./api";
import { ProductFormModal } from "./ProductFormModal";
import { StockAdjustModal } from "./StockAdjustModal";

export function InventorySearchScreen() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const products = useProductSearch(search);
  const del = useDeleteProduct();
  const styles = useThemedStyles(makeStyles);

  const openActions = (p: Product) => {
    Alert.alert(p.name, undefined, [
      { text: "Editar", onPress: () => setEditing(p) },
      { text: "Ajustar stock", onPress: () => setAdjusting(p) },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const confirmDelete = (p: Product) =>
    Alert.alert(
      "Eliminar producto",
      `¿Eliminar "${p.name}"? Se desactivará y dejará de aparecer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(p.id, {
              onError: (e) => Alert.alert("Error", (e as Error).message),
            }),
        },
      ],
    );

  return (
    <Screen padded={false}>
      <ListView
        items={products.data ?? []}
        loading={products.isLoading}
        error={products.error}
        refetch={products.refetch}
        isRefetching={products.isRefetching}
        keyExtractor={(p) => String(p.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar placeholder="Buscar por SKU, nombre, marca…" value={search} onChangeText={setSearch} />
            <Text style={styles.hint}>Mantén pulsada una fila para eliminar.</Text>
          </View>
        }
        emptyText={search ? "Sin resultados." : "No hay productos."}
        renderItem={(item: Product) => {
          const available = item.available_quantity ?? item.stock_quantity;
          const low =
            Number(available) <= Number(item.minimum_stock) && Number(item.minimum_stock) > 0;
          return (
            <Card onPress={() => openActions(item)} onLongPress={() => confirmDelete(item)}>
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
                {item.location ? <Text style={styles.location}>{item.location}</Text> : null}
              </View>
            </Card>
          );
        }}
      />
      <FAB onPress={() => setCreating(true)} />
      <ProductFormModal visible={creating} onClose={() => setCreating(false)} product={null} />
      <ProductFormModal visible={!!editing} onClose={() => setEditing(null)} product={editing} />
      <StockAdjustModal visible={!!adjusting} onClose={() => setAdjusting(null)} product={adjusting} />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cardHeader: { flexDirection: "row", justifyContent: "space-between" },
    name: { fontSize: font.md, fontWeight: "600", color: colors.text, flexShrink: 1 },
    price: { fontSize: font.md, fontWeight: "700", color: colors.text },
    meta: { fontSize: font.sm, color: colors.dimmed, marginTop: 2 },
    stockRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    stock: { fontSize: font.sm, color: colors.text },
    lowStock: { color: colors.danger, fontWeight: "700" },
    location: { fontSize: font.sm, color: colors.dimmed },
    hint: { fontSize: font.xs, color: colors.dimmed, marginTop: 6, fontStyle: "italic" },
  });
