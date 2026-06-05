import { Alert, StyleSheet, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import {
  Badge,
  Button,
  Card,
  DetailRow,
  ErrorState,
  Field,
  Loading,
  SectionTitle,
} from "../../components/ui";
import {
  font,
  poStatusColors,
  poStatusLabels,
  spacing,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { MoreStackParamList } from "../../navigation/types";
import { usePOAction, usePurchaseOrder } from "./api";

export function PurchaseOrderDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "PurchaseOrderDetail">>();
  const { data: o, isLoading, error } = usePurchaseOrder(params.id);
  const action = usePOAction(params.id);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (isLoading) return <Loading />;
  if (error || !o) return <Screen><ErrorState text="No se pudo cargar la orden." /></Screen>;

  const st = o.status ?? "draft";
  const canSend = st === "draft";
  const canReceive = st === "sent" || st === "partially_received";
  const canCancel = st !== "received" && st !== "cancelled";
  const run = (a: "send" | "cancel" | "receive-all", msg: string) =>
    Alert.alert("Confirmar", msg, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí", onPress: () => action.mutate(a, { onError: (e) => Alert.alert("Error", (e as Error).message) }) },
    ]);

  return (
    <Screen scroll>
      {(canSend || canReceive || canCancel) && (
        <Card style={styles.actions}>
          {canSend && <Button title="Enviar" icon="send" onPress={() => run("send", "¿Enviar la orden al proveedor?")} />}
          {canReceive && (
            <Button title="Recibir todo" icon="checkmark-done" color={colors.teal} onPress={() => run("receive-all", "¿Recibir todas las líneas?")} />
          )}
          {canCancel && (
            <Button title="Cancelar orden" variant="subtle" color={colors.danger} onPress={() => run("cancel", "¿Cancelar la orden?")} />
          )}
        </Card>
      )}

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

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    actions: { gap: spacing.sm },
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
