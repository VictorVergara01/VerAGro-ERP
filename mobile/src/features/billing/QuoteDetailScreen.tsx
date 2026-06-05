import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";

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
import { colors, font, quoteStatusColors, quoteStatusLabels, spacing } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { MoreNav, MoreStackParamList } from "../../navigation/types";
import { useConvertQuote, useQuote, useQuoteAction } from "./api";
import { QuoteFormModal } from "./QuoteFormModal";
import { shareDocumentPdf } from "./pdf";

export function QuoteDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "QuoteDetail">>();
  const nav = useNavigation<MoreNav>();
  const { data: q, isLoading, error } = useQuote(params.id);
  const action = useQuoteAction(params.id);
  const convert = useConvertQuote(params.id);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !q) return <Screen><ErrorState text="No se pudo cargar la cotización." /></Screen>;

  const st = q.status ?? "draft";
  const canApprove = st === "draft" || st === "sent";
  const canReject = st !== "converted_to_invoice" && st !== "rejected";
  const canConvert = st === "approved";
  const canEdit = st === "draft" || st === "sent";

  const run = (a: "approve" | "reject", msg: string) =>
    Alert.alert("Confirmar", msg, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí", onPress: () => action.mutate(a, { onError: (e) => Alert.alert("Error", (e as Error).message) }) },
    ]);

  const doConvert = () =>
    convert.mutate(undefined, {
      onSuccess: (inv) => nav.replace("InvoiceDetail", { id: inv.id, title: inv.invoice_number ?? "Factura" }),
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });

  return (
    <Screen scroll>
      <Card style={styles.actions}>
        {canApprove && <Button title="Aprobar" icon="checkmark" onPress={() => run("approve", "¿Aprobar la cotización?")} />}
        {canEdit && <Button title="Editar" icon="create" variant="subtle" onPress={() => setEditOpen(true)} />}
        {canConvert && (
          <Button title="Convertir en factura" icon="receipt" color={colors.grape} loading={convert.isPending} onPress={doConvert} />
        )}
        <Button
          title="Compartir PDF"
          icon="document-text"
          variant="subtle"
          onPress={() =>
            void shareDocumentPdf({
              path: `/api/quotes/${q.id}/pdf/`,
              filename: `${q.quote_number ?? "cotizacion"}.pdf`,
            })
          }
        />
        {canReject && (
          <Button title="Rechazar" variant="subtle" color={colors.danger} onPress={() => run("reject", "¿Rechazar la cotización?")} />
        )}
      </Card>

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

      <QuoteFormModal visible={editOpen} onClose={() => setEditOpen(false)} quote={q} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
