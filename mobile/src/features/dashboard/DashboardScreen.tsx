import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Card, EmptyState, Loading, SectionTitle } from "../../components/ui";
import {
  font,
  radius,
  softBg,
  spacing,
  statusColors,
  statusLabels,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";
import { formatCurrency } from "../../utils/format";
import { useAuth } from "../auth/useAuth";
import { DashboardData, OPEN_STATUSES, sumStatuses, useDashboard } from "./api";

const FINANCIAL_ROLES = ["admin", "sales"];
const logo = require("../../../assets/logo.png");

function StatCard({
  label,
  value,
  icon,
  color,
  hint,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  hint?: string;
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const c = color ?? colors.primary;
  return (
    <Card style={StyleSheet.flatten([styles.stat, highlight && { backgroundColor: colors.primary, borderColor: colors.primary }])}>
      <View style={styles.statTop}>
        <View
          style={[
            styles.statIcon,
            { backgroundColor: highlight ? "rgba(255,255,255,0.2)" : softBg(c) },
          ]}
        >
          <Ionicons name={icon} size={22} color={highlight ? "#fff" : c} />
        </View>
        <View
          style={[
            styles.statArrow,
            { backgroundColor: highlight ? "rgba(255,255,255,0.25)" : colors.bg },
          ]}
        >
          <Ionicons name="arrow-up" size={14} color={highlight ? "#fff" : colors.dimmed} />
        </View>
      </View>
      <Text style={[styles.statValue, highlight && { color: "#fff" }]}>{value}</Text>
      <Text style={[styles.statLabel, highlight && { color: "rgba(255,255,255,0.9)" }]}>
        {label}
      </Text>
      {hint ? (
        <Text style={[styles.statHint, highlight && { color: "rgba(255,255,255,0.9)" }]}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

function StatusBars({ data }: { data: DashboardData }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const entries = Object.entries(data.service_orders_by_status).filter(([, n]) => n > 0);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (!entries.length) return <EmptyState text="Sin órdenes registradas." />;
  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map(([status, n]) => (
        <View key={status} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {statusLabels[status] ?? status}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={{
                width: `${(n / max) * 100}%`,
                backgroundColor: statusColors[status] ?? colors.primary,
                height: 10,
                borderRadius: 6,
              }}
            />
          </View>
          <Text style={styles.barValue}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

export function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const isFinancial = user && FINANCIAL_ROLES.includes(user.role);
  const navigation = useNavigation<any>();
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();

  const header = (
    <View style={styles.greetingRow}>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <View style={{ flex: 1 }}>
        <Text style={styles.greeting}>Hola, {user?.full_name?.split(" ")[0] ?? "—"}</Text>
        <Text style={styles.subtitle}>Resumen de la operación</Text>
      </View>
    </View>
  );

  if (!isFinancial) {
    // Rol operativo: accesos rápidos en vez del panel financiero.
    return (
      <Screen scroll>
        {header}
        <QuickLink icon="construct" color={colors.info} title="Órdenes de servicio" onPress={() => navigation.navigate("OrdersTab")} />
        <QuickLink icon="cube" color={colors.teal} title="Inventario" onPress={() => navigation.navigate("InventoryTab")} />
        <QuickLink icon="grid" color={colors.grape} title="Más módulos" onPress={() => navigation.navigate("MoreTab")} />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        {header}
        <Loading />
      </Screen>
    );
  }
  if (error || !data) {
    const forbidden = (error as Error)?.message === "forbidden";
    return (
      <Screen>
        {header}
        <Card>
          <Text style={{ color: colors.dimmed }}>
            {forbidden
              ? "Tu rol no tiene acceso al panel financiero."
              : "No se pudo cargar el dashboard."}
          </Text>
        </Card>
      </Screen>
    );
  }

  const openOrders = sumStatuses(data.service_orders_by_status, OPEN_STATUSES);

  return (
    <Screen scroll refreshing={isRefetching} onRefresh={() => void refetch()}>
      {header}
      <View style={styles.grid}>
        <StatCard label="Órdenes abiertas" value={openOrders} icon="construct" highlight />
        <StatCard
          label="Esperando piezas"
          value={data.service_orders_by_status["waiting_parts"] ?? 0}
          icon="time"
          color={colors.warning}
        />
        <StatCard
          label="Facturas pendientes"
          value={data.invoices.pending_count}
          hint={formatCurrency(data.invoices.pending_amount)}
          icon="receipt"
          color={colors.grape}
        />
        <StatCard
          label="Ventas del mes"
          value={formatCurrency(data.invoices.sales_this_month)}
          icon="cash"
          color={colors.primary}
        />
        <StatCard
          label="Bajo stock"
          value={data.inventory.low_stock_count}
          icon="alert-circle"
          color={colors.danger}
        />
        <StatCard
          label="Servicios terminados"
          value={data.service_orders_by_status["finished"] ?? 0}
          icon="checkmark-circle"
          color={colors.teal}
        />
      </View>

      <Card>
        <SectionTitle>Órdenes por estado</SectionTitle>
        <StatusBars data={data} />
      </Card>
    </Screen>
  );
}

function QuickLink({
  icon,
  color,
  title,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card onPress={onPress} style={styles.quick}>
      <View style={[styles.statIcon, { backgroundColor: softBg(color) }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.dimmed} />
    </Card>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    greetingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    logo: { width: 52, height: 52 },
    greeting: { fontSize: font.xl, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: font.sm, color: colors.dimmed },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    stat: { width: "47%", flexGrow: 1, gap: 2 },
    statTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    statIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    statArrow: {
      width: 26,
      height: 26,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    statValue: { fontSize: font.xxl, fontWeight: "700", color: colors.text },
    statLabel: { fontSize: font.sm, color: colors.dimmed, fontWeight: "500" },
    statHint: { fontSize: font.xs, color: colors.dimmed, marginTop: 2 },
    barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    barLabel: { width: 110, fontSize: font.sm, color: colors.text },
    barTrack: { flex: 1, backgroundColor: colors.bg, borderRadius: 6, height: 10, overflow: "hidden" },
    barValue: { width: 28, textAlign: "right", fontSize: font.sm, fontWeight: "700", color: colors.text },
    quick: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    quickTitle: { flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text },
  });
