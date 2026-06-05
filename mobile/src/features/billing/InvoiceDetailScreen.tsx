import { useState } from "react";
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
  invoiceStatusColors,
  invoiceStatusLabels,
  spacing,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { MoreStackParamList } from "../../navigation/types";
import { INVOICE_TYPE_LABEL, useInvoice, useInvoiceAction } from "./api";
import { InvoiceFormModal } from "./InvoiceFormModal";
import { PaymentModal } from "./PaymentModal";
import { shareDocumentPdf } from "./pdf";
import { sendInvoiceWhatsapp } from "./whatsapp";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  yappy: "Yappy",
  ach: "ACH",
  card: "Tarjeta",
  other: "Otro",
};

export function InvoiceDetailScreen() {
  const { params } = useRoute<RouteProp<MoreStackParamList, "InvoiceDetail">>();
  const { data: inv, isLoading, error } = useInvoice(params.id);
  const action = useInvoiceAction(params.id);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (isLoading) return <Loading />;
  if (error || !inv) return <Screen><ErrorState text="No se pudo cargar la factura." /></Screen>;

  const st = inv.status ?? "draft";
  const canIssue = st === "draft";
  const canEdit = st === "draft";
  const canPay = st === "issued" || st === "partially_paid";
  const canCancel = st !== "paid" && st !== "cancelled";

  const run = (a: "issue" | "cancel", confirm: string) =>
    Alert.alert("Confirmar", confirm, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sí",
        onPress: () =>
          action.mutate(a, { onError: (e) => Alert.alert("Error", (e as Error).message) }),
      },
    ]);

  return (
    <Screen scroll>
      <Card style={styles.actions}>
        {canIssue && <Button title="Emitir" icon="send" onPress={() => run("issue", "¿Emitir esta factura?")} />}
        {canEdit && <Button title="Editar" icon="create" variant="subtle" onPress={() => setEditOpen(true)} />}
        {canPay && (
          <Button title="Registrar pago" icon="cash" color={colors.primary} onPress={() => setPayOpen(true)} />
        )}
        <Button title="WhatsApp" icon="logo-whatsapp" variant="subtle" color={colors.teal} onPress={() => void sendInvoiceWhatsapp(inv)} />
        <Button
          title="Compartir PDF"
          icon="document-text"
          variant="subtle"
          onPress={() =>
            void shareDocumentPdf({
              path: `/api/invoices/${inv.id}/pdf/`,
              filename: `${inv.invoice_number ?? "factura"}.pdf`,
            })
          }
        />
        {canCancel && (
          <Button title="Cancelar factura" variant="subtle" color={colors.danger} onPress={() => run("cancel", "¿Cancelar esta factura?")} />
        )}
      </Card>

      <Card>
        <Badge label={invoiceStatusLabels[st] ?? st} color={invoiceStatusColors[st] ?? colors.dimmed} />
        <Field label="Cliente" value={inv.customer_name} />
        <Field label="Tipo" value={INVOICE_TYPE_LABEL[inv.invoice_type ?? "service_invoice"]} />
        <Field label="Emisión" value={formatDate(inv.issue_date)} />
        <Field label="Vence" value={formatDate(inv.due_date)} />
      </Card>

      <Card>
        <SectionTitle>Conceptos</SectionTitle>
        {(inv.lines ?? []).map((l) => (
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
        <DetailRow label="Subtotal" value={formatCurrency(inv.subtotal)} />
        {Number(inv.discount_amount) > 0 && (
          <DetailRow label={`Descuento (${Number(inv.discount_percentage)}%)`} value={`−${formatCurrency(inv.discount_amount)}`} />
        )}
        {Number(inv.tax_amount) > 0 && (
          <DetailRow label={`Impuesto (${Number(inv.tax_percentage)}%)`} value={formatCurrency(inv.tax_amount)} />
        )}
        <DetailRow label="Total" value={formatCurrency(inv.total)} strong />
        <DetailRow label="Pagado" value={formatCurrency(inv.paid_amount)} />
        <DetailRow label="Saldo" value={formatCurrency(inv.balance_due)} strong />
      </Card>

      {(inv.payments ?? []).length > 0 && (
        <Card>
          <SectionTitle>Pagos</SectionTitle>
          {(inv.payments ?? []).map((p) => (
            <View key={p.id} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineDesc}>{PAYMENT_METHOD_LABEL[p.method ?? "cash"]}</Text>
                <Text style={styles.lineMeta}>
                  {formatDate(p.payment_date)}
                  {p.reference_number ? ` · ${p.reference_number}` : ""}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatCurrency(p.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      <PaymentModal visible={payOpen} onClose={() => setPayOpen(false)} invoice={inv} />
      <InvoiceFormModal visible={editOpen} onClose={() => setEditOpen(false)} invoice={inv} />
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
