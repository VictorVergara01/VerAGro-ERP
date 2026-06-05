import { StyleSheet, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import {
  Badge,
  Card,
  DetailRow,
  ErrorState,
  Field,
  Loading,
  SectionTitle,
} from "../../components/ui";
import { colors, font, poStatusColors, poStatusLabels, spacing } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { MoreStackParamList } from "../../navigation/types";
import { usePurchaseOrder } from "./api";

export function PurchaseOrderDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "PurchaseOrderDetail">>();
  const { data: o, isLoading, error } = usePurchaseOrder(params.id);

  if (isLoading) return <Loading />;
  if (error || !o) return <Screen><ErrorState text="No se pudo cargar la orden." /></Screen>;

  const st = o.status ?? "draft";
  return (
    <Screen scroll>
      <Card>
        <Badge label={poStatusLabels[st] ?? st} color={poStatusColors[st] ?? colors.dimmed} />
        <Field label="Proveedor" value={o.supplier_name} />
        <Field label="Fecha" value={formatDate(o.order_date)} />
        <Field label="Esperada" value={formatDate(o.expected_date)} />
        <Field label="Moneda" value={o.currency} />
      </Card>

      <Card>
        <SectionTitle>Líneas</SectionTitle>
        {(o.lines ?? []).map((l) => (
          <View key={l.id} style={styles.lineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineDesc}>{l.product_name}</Text>
              <Text style={styles.lineMeta}>
                {l.quantity_received}/{l.quantity_ordered} · {formatCurrency(l.unit_purchase_cost)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatCurrency(l.line_subtotal)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <DetailRow label="Subtotal productos" value={formatCurrency(o.subtotal_products)} />
        <DetailRow label="Envío" value={formatCurrency(o.shipping_cost)} />
        <DetailRow label="Costos adicionales" value={formatCurrency(o.additional_costs_total)} />
        <DetailRow label="Total" value={formatCurrency(o.grand_total)} strong />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  lineDesc: { fontSize: font.md, color: colors.text },
  lineMeta: { fontSize: font.sm, color: colors.dimmed },
  lineTotal: { fontSize: font.md, fontWeight: "600", color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});
