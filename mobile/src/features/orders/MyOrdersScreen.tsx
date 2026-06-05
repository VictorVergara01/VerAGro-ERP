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
import {
  statusColors,
  statusLabels,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";
import type { AppNav } from "../../navigation/types";
import { useMyOrders, type ServiceOrder } from "./api";
import { ServiceOrderFormModal } from "./ServiceOrderFormModal";

const SERVICE_TYPE_LABEL: Record<string, string> = {
  diagnostic: "Diagnóstico",
  preventive_maintenance: "Mant. preventivo",
  corrective_maintenance: "Mant. correctivo",
  repair: "Reparación",
  cleaning: "Limpieza",
  calibration: "Calibración",
  other: "Otro",
};

function OrderCard({
  order,
  onPress,
}: {
  order: ServiceOrder;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const status = order.status ?? "received";
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardNumber}>{order.service_order_number}</Text>
        <View style={[styles.badge, { backgroundColor: statusColors[status] }]}>
          <Text style={styles.badgeText}>{statusLabels[status] ?? status}</Text>
        </View>
      </View>
      <Text style={styles.cardCustomer}>{order.customer_name}</Text>
      <Text style={styles.cardMeta}>
        {order.equipment_name || "Sin equipo"} ·{" "}
        {SERVICE_TYPE_LABEL[order.service_type ?? "diagnostic"]}
      </Text>
    </TouchableOpacity>
  );
}

export function MyOrdersScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const navigation = useNavigation<AppNav>();
  const [all, setAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useMyOrders(
    user?.id,
    all,
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>
            {all ? "Todas las órdenes" : "Solo mis órdenes"}
          </Text>
          <Switch value={all} onValueChange={setAll} />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>No se pudieron cargar las órdenes.</Text>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(o) => String(o.id)}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() =>
                navigation.navigate("OrderDetail", {
                  id: item.id,
                  title: item.service_order_number,
                })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {all ? "No hay órdenes." : "No tienes órdenes asignadas."}
            </Text>
          }
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => setFormOpen(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      <ServiceOrderFormModal visible={formOpen} onClose={() => setFormOpen(false)} />
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
    headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
    headerLink: { color: colors.primary, fontWeight: "600", fontSize: 14 },
    logout: { color: colors.danger, fontWeight: "600", fontSize: 14 },
    list: { padding: 16, gap: 12 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    cardNumber: { fontSize: 16, fontWeight: "700", color: colors.text },
    badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
    cardCustomer: { fontSize: 15, color: colors.text },
    cardMeta: { fontSize: 13, color: colors.dimmed, marginTop: 2 },
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
