import { useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  font,
  radius,
  spacing,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "../../theme";

// ---------- Segmented (selección entre pocas opciones) ----------
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.segment}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[styles.segmentItem, active && styles.segmentActive]}
              onPress={() => onChange(o.value)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Picker (selector modal de una lista) ----------
export function Picker<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = "Seleccionar…",
  clearable,
}: {
  label?: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(true)}>
        <Text style={[styles.pickerText, !selected && { color: colors.dimmed }]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.dimmed} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <ScrollView style={{ maxHeight: 360 }}>
              {clearable && (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, { color: colors.dimmed }]}>— Ninguno —</Text>
                </TouchableOpacity>
              )}
              {options.map((o) => (
                <TouchableOpacity
                  key={String(o.value)}
                  style={styles.option}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{o.label}</Text>
                  {o.value === value && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------- FormModal (contenedor de formulario a pantalla completa) ----------
export function FormModal({
  visible,
  onClose,
  title,
  onSubmit,
  submitting,
  submitLabel = "Guardar",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.formHeader, { paddingTop: spacing.md + insets.top }]}>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.formTitle}>{title}</Text>
        <TouchableOpacity onPress={onSubmit} disabled={submitting} hitSlop={10}>
          <Text style={[styles.save, submitting && { opacity: 0.5 }]}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={styles.formBody}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Modal>
  );
}

// ---------- LineCard (una línea de un documento, con eliminar) ----------
export function LineCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.lineCard}>
      <View style={styles.lineHeader}>
        <Text style={styles.lineTitle}>{title}</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

// ---------- AddRowButton (botón "+ Agregar") ----------
export function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.addRow} onPress={onPress}>
      <Ionicons name="add" size={18} color={colors.primary} />
      <Text style={styles.addRowText}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: { fontSize: font.sm, fontWeight: "600", color: colors.text },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
    },
    segmentItem: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center" },
    segmentActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: font.sm, fontWeight: "600", color: colors.dimmed },
    segmentTextActive: { color: "#fff" },
    pickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    pickerText: { fontSize: font.md, color: colors.text, flexShrink: 1 },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.xl },
    sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
    sheetTitle: { fontSize: font.md, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionText: { fontSize: font.md, color: colors.text },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    formTitle: { fontSize: font.lg, fontWeight: "700", color: colors.text },
    save: { fontSize: font.md, fontWeight: "700", color: colors.primary },
    formBody: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
    lineCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    lineTitle: { fontSize: font.sm, fontWeight: "700", color: colors.dimmed },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 10,
    },
    addRowText: { color: colors.primary, fontWeight: "600", fontSize: font.sm },
  });
