import { useRoute } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, statusColors, statusLabels } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { OrderDetailRoute } from "../../navigation/types";
import {
  useOrder,
  useOrderAction,
  type OrderAction,
  type ServiceOrderPart,
} from "./api";

const SERVICE_TYPE_LABEL: Record<string, string> = {
  diagnostic: "Diagnóstico",
  preventive_maintenance: "Mant. preventivo",
  corrective_maintenance: "Mant. correctivo",
  repair: "Reparación",
  cleaning: "Limpieza",
  calibration: "Calibración",
  other: "Otro",
};

const PART_STATUS_LABEL: Record<string, string> = {
  required: "Requerida",
  reserved: "Reservada",
  used: "Usada",
  pending_purchase: "Pend. compra",
  returned: "Devuelta",
};

function nextAction(
  status: string,
): { action: OrderAction; label: string } | null {
  switch (status) {
    case "received":
      return { action: "start-diagnostic", label: "Iniciar diagnóstico" };
    case "in_diagnostic":
    case "quoted":
      return { action: "approve", label: "Aprobar" };
    case "approved":
    case "waiting_parts":
      return { action: "start-work", label: "Iniciar trabajo" };
    case "in_progress":
      return { action: "finish", label: "Finalizar" };
    case "finished":
    case "invoiced":
      return { action: "deliver", label: "Entregar" };
    default:
      return null;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

function PartRow({ part }: { part: ServiceOrderPart }) {
  return (
    <View style={styles.partRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.partName}>{part.product_name}</Text>
        <Text style={styles.partMeta}>
          {part.quantity} · {PART_STATUS_LABEL[part.status ?? "required"]}
        </Text>
      </View>
      <Text style={styles.partTotal}>{formatCurrency(part.total_price)}</Text>
    </View>
  );
}

export function OrderDetailScreen() {
  const route = useRoute<OrderDetailRoute>();
  const { id } = route.params;
  const { data: order, isLoading, error, isRefetching } = useOrder(id);
  const action = useOrderAction(id);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error || !order) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No se pudo cargar la orden.</Text>
      </View>
    );
  }

  const status = order.status ?? "received";
  const next = nextAction(status);

  const runAction = () => {
    if (!next) return;
    Alert.alert("Confirmar", `¿${next.label}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: next.label,
        onPress: () =>
          action.mutate(next.action, {
            onError: (e) => Alert.alert("Error", (e as Error).message),
          }),
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.number}>{order.service_order_number}</Text>
        <View style={[styles.badge, { backgroundColor: statusColors[status] }]}>
          <Text style={styles.badgeText}>{statusLabels[status] ?? status}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Row label="Cliente" value={order.customer_name} />
        <Row label="Equipo" value={order.equipment_name || "Sin equipo"} />
        <Row
          label="Tipo"
          value={SERVICE_TYPE_LABEL[order.service_type ?? "diagnostic"]}
        />
        <Row label="Recibida" value={formatDate(order.received_date)} />
        <Row label="Técnico" value={order.technician_name || "Sin asignar"} />
      </View>

      {order.customer_complaint ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Reclamo del cliente</Text>
          <Text style={styles.bodyText}>{order.customer_complaint}</Text>
        </View>
      ) : null}

      {order.diagnostic_summary ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Diagnóstico</Text>
          <Text style={styles.bodyText}>{order.diagnostic_summary}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Piezas</Text>
        {(order.parts ?? []).length === 0 ? (
          <Text style={styles.dimmed}>Sin piezas.</Text>
        ) : (
          (order.parts ?? []).map((p) => <PartRow key={p.id} part={p} />)
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(order.total_amount)}</Text>
        </View>
      </View>

      {next ? (
        <TouchableOpacity
          style={[styles.actionBtn, action.isPending && styles.actionBtnDisabled]}
          onPress={runAction}
          disabled={action.isPending || isRefetching}
        >
          {action.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionText}>{next.label}</Text>
          )}
        </TouchableOpacity>
      ) : (
        <Text style={styles.dimmedCenter}>
          No hay acciones disponibles en este estado.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  error: { color: colors.danger },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  number: { fontSize: 20, fontWeight: "700", color: colors.text },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: colors.dimmed, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 8 },
  bodyText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dimmed: { color: colors.dimmed, fontSize: 14 },
  dimmedCenter: { color: colors.dimmed, fontSize: 14, textAlign: "center", marginTop: 8 },
  partRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  partName: { color: colors.text, fontSize: 14, fontWeight: "500" },
  partMeta: { color: colors.dimmed, fontSize: 12, marginTop: 2 },
  partTotal: { color: colors.text, fontSize: 14, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  totalValue: { fontSize: 15, fontWeight: "700", color: colors.text },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtnDisabled: { opacity: 0.7 },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
