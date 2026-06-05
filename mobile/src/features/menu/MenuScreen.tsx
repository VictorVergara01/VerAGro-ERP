import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Card } from "../../components/ui";
import { colors, font, radius, softBg, spacing } from "../../theme";
import type { MoreNav } from "../../navigation/types";
import { useAuth } from "../auth/useAuth";

type Item = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soon?: boolean;
  onPress?: () => void;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  technician: "Técnico",
  sales: "Ventas",
  inventory: "Inventario",
  readonly: "Solo lectura",
};

export function MenuScreen() {
  const { user, logout } = useAuth();
  const nav = useNavigation<MoreNav>();

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Menú",
      items: [
        { label: "Clientes", icon: "people", color: colors.warning, onPress: () => nav.navigate("Customers") },
        { label: "Equipos", icon: "hardware-chip", color: colors.grape, onPress: () => nav.navigate("Equipment") },
        { label: "Proveedores", icon: "car", color: colors.info, onPress: () => nav.navigate("Suppliers") },
        { label: "Compras", icon: "cart", color: colors.teal, onPress: () => nav.navigate("Purchasing") },
      ],
    },
    {
      title: "Facturación",
      items: [
        { label: "Cotizaciones", icon: "document-text", color: colors.info, onPress: () => nav.navigate("Quotes") },
        { label: "Facturas", icon: "receipt", color: colors.grape, onPress: () => nav.navigate("Invoices") },
      ],
    },
    {
      title: "General",
      items: [
        { label: "Reportes", icon: "bar-chart", color: colors.primary, onPress: () => nav.navigate("Reports") },
        { label: "Configuración", icon: "settings", color: colors.dimmed, soon: true },
      ],
    },
  ];

  return (
    <Screen scroll>
      <Card style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.full_name ?? "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.full_name ?? "Usuario"}</Text>
          <Text style={styles.userRole}>
            {ROLE_LABELS[user?.role ?? ""] ?? user?.role} · {user?.email}
          </Text>
        </View>
      </Card>

      {groups.map((group) => (
        <View key={group.title} style={{ gap: spacing.sm }}>
          <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
          <Card style={{ padding: 0 }}>
            {group.items.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                disabled={item.soon}
                onPress={item.onPress}
                activeOpacity={0.7}
                style={[styles.row, idx > 0 && styles.rowBorder]}
              >
                <View style={[styles.rowIcon, { backgroundColor: softBg(item.color) }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <Text style={[styles.rowLabel, item.soon && { color: colors.dimmed }]}>
                  {item.label}
                </Text>
                {item.soon ? (
                  <Text style={styles.soon}>Próximamente</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={colors.dimmed} />
                )}
              </TouchableOpacity>
            ))}
          </Card>
        </View>
      ))}

      <TouchableOpacity style={styles.logout} onPress={() => void logout()} activeOpacity={0.7}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: font.lg, fontWeight: "700" },
  userName: { fontSize: font.lg, fontWeight: "700", color: colors.text },
  userRole: { fontSize: font.sm, color: colors.dimmed },
  groupTitle: { fontSize: font.xs, fontWeight: "700", color: colors.dimmed, letterSpacing: 0.5, marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text },
  soon: { fontSize: font.xs, color: colors.dimmed, fontStyle: "italic" },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  logoutText: { color: colors.danger, fontSize: font.md, fontWeight: "700" },
});
