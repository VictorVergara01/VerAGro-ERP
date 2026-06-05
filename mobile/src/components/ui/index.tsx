import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  font,
  radius,
  softBg,
  spacing,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";

// ---------- Card ----------
export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  if (onPress || onLongPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------- Badge ----------
export function Badge({ label, color }: { label: string; color?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const c = color ?? colors.dimmed;
  return (
    <View style={[styles.badge, { backgroundColor: softBg(c) }]}>
      <Text style={[styles.badgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

// ---------- Button ----------
type ButtonVariant = "filled" | "outline" | "subtle";
export function Button({
  title,
  onPress,
  variant = "filled",
  color,
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const c = color ?? colors.primary;
  const isFilled = variant === "filled";
  const fg = isFilled ? "#fff" : c;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.btn,
        isFilled && { backgroundColor: c },
        variant === "outline" && { borderWidth: 1, borderColor: colors.border },
        variant === "subtle" && { backgroundColor: softBg(c) },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ---------- Field (etiqueta/valor) ----------
export function Field({ label, value }: { label: string; value?: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      {typeof value === "string" || typeof value === "number" || value == null ? (
        <Text style={styles.fieldValue}>{value === 0 ? "0" : value || "—"}</Text>
      ) : (
        value
      )}
    </View>
  );
}

// ---------- Row de detalle (label izquierda, valor derecha) ----------
export function DetailRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, strong && { color: colors.text, fontWeight: "700" }]}>
        {label}
      </Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={[styles.detailValue, strong && { fontWeight: "700" }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

// ---------- SearchBar ----------
export function SearchBar(props: TextInputProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.dimmed} />
      <TextInput
        placeholderTextColor={colors.dimmed}
        style={styles.searchInput}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

// ---------- Input con etiqueta (formularios) ----------
export function LabeledInput({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.dimmed}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

// ---------- SectionTitle ----------
export function SectionTitle({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ---------- FAB (botón flotante de crear) ----------
export function FAB({ onPress, icon = "add" }: { onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={28} color="#fff" />
    </TouchableOpacity>
  );
}

// ---------- Estados ----------
export function Loading() {
  const { colors } = useTheme();
  return <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />;
}

export function EmptyState({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.empty}>{text}</Text>;
}

export function ErrorState({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.errorText}>{text}</Text>;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
    badgeText: { fontSize: font.xs, fontWeight: "700" },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: radius.md,
      paddingVertical: 11,
      paddingHorizontal: 16,
    },
    btnText: { fontSize: font.md, fontWeight: "600" },
    field: { gap: 2, marginBottom: spacing.md },
    fieldLabel: { fontSize: font.xs, fontWeight: "700", color: colors.dimmed, letterSpacing: 0.4 },
    fieldValue: { fontSize: font.md, color: colors.text },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
    },
    detailLabel: { fontSize: font.md, color: colors.dimmed },
    detailValue: { fontSize: font.md, color: colors.text },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      height: 44,
    },
    searchInput: { flex: 1, fontSize: font.md, color: colors.text, paddingVertical: 0 },
    inputLabel: { fontSize: font.sm, fontWeight: "600", color: colors.text },
    input: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: font.md,
      color: colors.text,
    },
    sectionTitle: { fontSize: font.lg, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
    empty: { textAlign: "center", color: colors.dimmed, marginTop: 48, fontSize: font.md },
    errorText: { textAlign: "center", color: colors.danger, marginTop: 48, fontSize: font.md },
    fab: {
      position: "absolute",
      right: spacing.lg,
      bottom: spacing.lg,
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
  });
