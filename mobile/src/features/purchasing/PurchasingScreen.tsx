import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, FAB, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import {
  font,
  poStatusColors,
  poStatusLabels,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { MoreNav } from "../../navigation/types";
import { usePurchaseOrders, type PurchaseOrder } from "./api";
import { PurchaseOrderFormModal } from "./PurchaseOrderFormModal";

export function PurchasingScreen() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const nav = useNavigation<MoreNav>();
  const q = usePurchaseOrders(search);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen padded={false}>
      <ListView
        items={q.data ?? []}
        loading={q.isLoading}
        error={q.error}
        refetch={q.refetch}
        isRefetching={q.isRefetching}
        keyExtractor={(o) => String(o.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar placeholder="Buscar orden de compra…" value={search} onChangeText={setSearch} />
          </View>
        }
        emptyText="No hay órdenes de compra."
        renderItem={(o: PurchaseOrder) => {
          const st = o.status ?? "draft";
          return (
            <Card onPress={() => nav.navigate("PurchaseOrderDetail", { id: o.id, title: o.order_number ?? "Orden" })}>
              <View style={styles.row}>
                <Text style={styles.num}>{o.order_number}</Text>
                <Badge label={poStatusLabels[st] ?? st} color={poStatusColors[st] ?? colors.dimmed} />
              </View>
              <View style={styles.row}>
                <Text style={styles.meta}>
                  {o.supplier_name ?? "—"} · {formatDate(o.order_date)}
                </Text>
                <Text style={styles.total}>{formatCurrency(o.grand_total)}</Text>
              </View>
            </Card>
          );
        }}
      />
      <FAB onPress={() => setFormOpen(true)} />
      <PurchaseOrderFormModal visible={formOpen} onClose={() => setFormOpen(false)} />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    num: { fontSize: font.md, fontWeight: "700", color: colors.text },
    meta: { fontSize: font.sm, color: colors.dimmed, marginTop: 2, flexShrink: 1 },
    total: { fontSize: font.md, fontWeight: "700", color: colors.text, marginTop: 2 },
  });
