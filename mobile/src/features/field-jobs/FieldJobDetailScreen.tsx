import { useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { FieldJobsNav, FieldJobDetailRoute } from "../../navigation/types";
import { FieldJobFormModal } from "./FieldJobFormModal";
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  JOB_TYPE_LABEL,
  useFieldJob,
  useFieldJobAction,
} from "./api";

function Row({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

export function FieldJobDetailScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const route = useRoute<FieldJobDetailRoute>();
  const navigation = useNavigation<FieldJobsNav>();
  const { id } = route.params;
  const { data: job, isLoading, error } = useFieldJob(id);
  const action = useFieldJobAction(id);
  const [editVisible, setEditVisible] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error || !job) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No se pudo cargar el trabajo.</Text>
      </View>
    );
  }

  const status = job.status ?? "scheduled";
  const isFumigation = job.job_type === "fumigation";

  const run = (a: "mark-done" | "cancel" | "generate-invoice", confirm: string, ok: string) =>
    Alert.alert("Confirmar", confirm, [
      { text: "Volver", style: "cancel" },
      {
        text: "Continuar",
        onPress: () =>
          action.mutate(a, {
            onSuccess: (res) =>
              Alert.alert("Listo", a === "generate-invoice" ? `Factura ${res.invoice_number} generada.` : ok),
            onError: (e) => Alert.alert("Error", (e as Error).message),
          }),
      },
    ]);

  const hasGps = job.latitude != null && job.longitude != null;
  const hasApp = job.application_rate != null || job.tank_volume_liters != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.number}>{job.number}</Text>
        <View style={[styles.badge, { backgroundColor: FJ_STATUS_COLOR[status] }]}>
          <Text style={styles.badgeText}>{FJ_STATUS_LABEL[status] ?? status}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Row label="Cliente" value={job.customer_name ?? ""} />
        <Row label="Dron" value={job.equipment_name || "Sin asignar"} />
        <Row label="Técnico" value={job.technician_name || "Sin asignar"} />
        <Row label="Tipo" value={JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} />
        <Row label="Finca" value={job.location ?? ""} />
        <Row label="Cultivo" value={job.crop ?? ""} />
        <Row label="Producto" value={job.applied_product ?? ""} />
        <Row label="Programado" value={formatDate(job.scheduled_date)} />
        {job.done_date ? <Row label="Hecho" value={formatDate(job.done_date)} /> : null}
      </View>

      <View style={styles.card}>
        <Row label={isFumigation ? "Hectáreas" : "Quintales"} value={isFumigation ? String(job.hectares) : String(job.quintals)} />
        <Row label={isFumigation ? "Precio/ha" : "Precio/qq"} value={formatCurrency(job.unit_price)} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(job.total)}</Text>
        </View>
      </View>

      {hasApp ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() =>
            navigation.navigate("SprayCalculator", {
              prefill: {
                hectares: Number(job.hectares) || undefined,
                water_per_hectare: job.water_per_hectare != null ? Number(job.water_per_hectare) : undefined,
                tank_volume_liters: job.tank_volume_liters != null ? Number(job.tank_volume_liters) : undefined,
              },
            })
          }
        >
          <Text style={styles.linkText}>Calculadora de mezcla ›</Text>
        </TouchableOpacity>
      ) : null}

      {hasGps ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${job.latitude},${job.longitude}`)}
        >
          <Text style={styles.linkText}>Abrir ubicación en Maps ›</Text>
        </TouchableOpacity>
      ) : null}

      {job.notes ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notas</Text>
          <Text style={styles.bodyText}>{job.notes}</Text>
        </View>
      ) : null}

      {status === "scheduled" ? (
        <>
          <TouchableOpacity style={styles.docBtn} onPress={() => setEditVisible(true)}>
            <Text style={styles.docText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => run("mark-done", "¿Marcar como hecho?", "Marcado como hecho.")}
            disabled={action.isPending}
          >
            <Text style={styles.actionText}>Marcar hecho</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => run("cancel", "¿Cancelar el trabajo?", "Trabajo cancelado.")}>
            <Text style={styles.cancelText}>Cancelar trabajo</Text>
          </TouchableOpacity>
        </>
      ) : status === "done" ? (
        <>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => run("generate-invoice", "¿Generar la factura?", "Factura generada.")}
            disabled={action.isPending}
          >
            <Text style={styles.actionText}>Facturar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => run("cancel", "¿Cancelar el trabajo?", "Trabajo cancelado.")}>
            <Text style={styles.cancelText}>Cancelar trabajo</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.dimmedCenter}>No hay acciones disponibles en este estado.</Text>
      )}

      <FieldJobFormModal visible={editVisible} onClose={() => setEditVisible(false)} job={job} />
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
    error: { color: colors.danger },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    number: { fontSize: 20, fontWeight: "700", color: colors.text },
    badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    rowLabel: { color: colors.dimmed, fontSize: 14 },
    rowValue: { color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 8 },
    bodyText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    totalLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
    totalValue: { fontSize: 15, fontWeight: "700", color: colors.text },
    linkBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
    linkText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
    docBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.primary, alignItems: "center" },
    docText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
    actionBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
    actionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    cancelBtn: { padding: 14, alignItems: "center", marginTop: 4 },
    cancelText: { color: colors.danger, fontSize: 15, fontWeight: "700" },
    dimmedCenter: { color: colors.dimmed, fontSize: 14, textAlign: "center", marginTop: 8 },
  });
