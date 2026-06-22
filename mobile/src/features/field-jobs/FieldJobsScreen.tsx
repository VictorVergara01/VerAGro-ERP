import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../auth/useAuth";
import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { FieldJobsNav } from "../../navigation/types";
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  useFieldJobs,
  type FieldJob,
} from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";

function JobCard({ job, onPress }: { job: FieldJob; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const status = job.status ?? "scheduled";
  const qty = `${job.hectares} ha`;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardNumber}>{job.number}</Text>
        <View style={[styles.badge, { backgroundColor: FJ_STATUS_COLOR[status] }]}>
          <Text style={styles.badgeText}>{FJ_STATUS_LABEL[status] ?? status}</Text>
        </View>
      </View>
      <Text style={styles.cardCustomer}>{job.customer_name}</Text>
      <Text style={styles.cardMeta}>
        {job.location || "Sin finca"} · {qty} ·{" "}
        {formatCurrency(job.total)}
      </Text>
      <Text style={styles.cardDate}>{formatDate(job.scheduled_date)}</Text>
    </TouchableOpacity>
  );
}

export function FieldJobsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const navigation = useNavigation<FieldJobsNav>();
  const [all, setAll] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useFieldJobs(all, user?.id);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>{all ? "Todos los trabajos" : "Solo míos"}</Text>
          <Switch value={all} onValueChange={setAll} />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>No se pudieron cargar los trabajos.</Text>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(j) => String(j.id)}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              onPress={() =>
                navigation.navigate("FieldJobDetail", { id: item.id, title: item.number ?? "Trabajo" })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay trabajos de campo.</Text>}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setFormOpen(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      <FieldJobFormModal visible={formOpen} onClose={() => setFormOpen(false)} job={null} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    toolbar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    toggle: { flexDirection: "row", alignItems: "center", gap: 8 },
    toggleLabel: { color: colors.text, fontSize: 14 },
    list: { padding: 16, gap: 12 },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    cardNumber: { fontSize: 16, fontWeight: "700", color: colors.text },
    badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
    cardCustomer: { fontSize: 15, color: colors.text },
    cardMeta: { fontSize: 13, color: colors.dimmed, marginTop: 2 },
    cardDate: { fontSize: 12, color: colors.dimmed, marginTop: 2 },
    empty: { textAlign: "center", color: colors.dimmed, marginTop: 40 },
    error: { textAlign: "center", color: colors.danger, marginTop: 40 },
    fab: {
      position: "absolute",
      right: 16,
      bottom: 16,
      width: 56,
      height: 56,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      elevation: 5,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
  });
