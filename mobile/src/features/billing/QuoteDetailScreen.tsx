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
import { colors, font, quoteStatusColors, quoteStatusLabels, spacing } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { MoreStackParamList } from "../../navigation/types";
import { useQuote } from "./api";

export function QuoteDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "QuoteDetail">>();
  const { data: q, isLoading, error } = useQuote(params.id);

  if (isLoading) return <Loading />;
  if (error || !q) return <Screen><ErrorState text="No se pudo cargar la cotización." /></Screen>;

  const st = q.status ?? "draft";
  return (
    <Screen scroll>
      <Card>
        <Badge label={quoteStatusLabels[st] ?? st} color={quoteStatusColors[st] ?? colors.dimmed} />
        <Field label="Cliente" value={q.customer_name} />
        <Field label="Emisión" value={formatDate(q.issue_date)} />
        <Field label="Vence" value={formatDate(q.expiration_date)} />
      </Card>

      <Card>
        <SectionTitle>Conceptos</SectionTitle>
        {(q.lines ?? []).map((l) => (
          <View key={l.id} style={styles.lineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineDesc}>{l.description || l.product_sku || "—"}</Text>
              <Text style={styles.lineMeta}>
                {l.quantity} × {formatCurrency(l.unit_price)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatCurrency(l.total)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <DetailRow label="Subtotal" value={formatCurrency(q.subtotal)} />
        {Number(q.discount_amount) > 0 && (
          <DetailRow label={`Descuento (${Number(q.discount_percentage)}%)`} value={`−${formatCurrency(q.discount_amount)}`} />
        )}
        {Number(q.tax_amount) > 0 && (
          <DetailRow label={`Impuesto (${Number(q.tax_percentage)}%)`} value={formatCurrency(q.tax_amount)} />
        )}
        <DetailRow label="Total" value={formatCurrency(q.total)} strong />
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
