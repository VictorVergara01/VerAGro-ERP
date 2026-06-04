import { useEffect, useState } from "react";
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

import { colors } from "../../theme";
import type { OrderChecklistRoute } from "../../navigation/types";
import {
  ITEM_STATUS,
  useChecklistTemplates,
  useCompleteChecklist,
  useFillChecklist,
  useInstantiateChecklist,
  useOrderChecklists,
  type ServiceChecklist,
} from "./api";

function ChecklistBlock({
  checklist,
  orderId,
}: {
  checklist: ServiceChecklist;
  orderId: number;
}) {
  const fill = useFillChecklist(orderId);
  const complete = useCompleteChecklist(orderId);
  const [statuses, setStatuses] = useState<Record<number, string>>({});

  useEffect(() => {
    const m: Record<number, string> = {};
    for (const it of checklist.items ?? []) m[it.id] = it.status ?? "pending";
    setStatuses(m);
  }, [checklist.items]);

  const save = () =>
    fill.mutate(
      {
        checklistId: checklist.id,
        items: Object.entries(statuses).map(([id, status]) => ({
          id: Number(id),
          status,
        })),
      },
      {
        onSuccess: () => Alert.alert("Checklist", "Guardado."),
        onError: (e) => Alert.alert("Error", (e as Error).message),
      },
    );

  const doComplete = () =>
    complete.mutate(checklist.id, {
      onSuccess: () => Alert.alert("Checklist", "Completado."),
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });

  return (
    <View style={styles.card}>
      <View style={styles.blockHeader}>
        <Text style={styles.blockTitle}>{checklist.template_name}</Text>
        {checklist.completed_at ? (
          <View style={styles.doneBadge}>
            <Text style={styles.doneText}>Completado</Text>
          </View>
        ) : null}
      </View>

      {(checklist.items ?? []).map((it) => (
        <View key={it.id} style={styles.item}>
          <Text style={styles.itemName}>{it.item_name}</Text>
          <View style={styles.chips}>
            {ITEM_STATUS.map((s) => {
              const active = (statuses[it.id] ?? "pending") === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() =>
                    setStatuses((prev) => ({ ...prev, [it.id]: s.value }))
                  }
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <View style={styles.blockActions}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={save}
          disabled={fill.isPending}
        >
          <Text style={styles.outlineText}>
            {fill.isPending ? "Guardando…" : "Guardar"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.greenBtn}
          onPress={doComplete}
          disabled={complete.isPending}
        >
          <Text style={styles.greenText}>Completar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ChecklistScreen() {
  const route = useRoute<OrderChecklistRoute>();
  const { id: orderId } = route.params;
  const checklists = useOrderChecklists(orderId);
  const templates = useChecklistTemplates();
  const instantiate = useInstantiateChecklist(orderId);

  const addTemplate = (templateId: number, name: string) =>
    Alert.alert("Agregar checklist", `¿Instanciar "${name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Agregar",
        onPress: () =>
          instantiate.mutate(templateId, {
            onError: (e) => Alert.alert("Error", (e as Error).message),
          }),
      },
    ]);

  if (checklists.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Agregar plantilla</Text>
        {(templates.data ?? []).length === 0 ? (
          <Text style={styles.dimmed}>No hay plantillas.</Text>
        ) : (
          (templates.data ?? []).map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.templateRow}
              onPress={() => addTemplate(t.id, t.name)}
            >
              <Text style={styles.templateName}>{t.name}</Text>
              <Text style={styles.plus}>+</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {(checklists.data ?? []).length === 0 ? (
        <Text style={styles.dimmedCenter}>Esta orden no tiene checklists.</Text>
      ) : (
        (checklists.data ?? []).map((cl) => (
          <ChecklistBlock key={cl.id} checklist={cl} orderId={orderId} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 8 },
  dimmed: { color: colors.dimmed, fontSize: 14 },
  dimmedCenter: { color: colors.dimmed, fontSize: 14, textAlign: "center", marginTop: 8 },
  templateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  templateName: { color: colors.text, fontSize: 14 },
  plus: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  blockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  blockTitle: { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1 },
  doneBadge: {
    backgroundColor: "#0ca678",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  doneText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  item: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  itemName: { color: colors.text, fontSize: 14, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.dimmed, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  blockActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  outlineText: { color: colors.primary, fontWeight: "600" },
  greenBtn: {
    backgroundColor: "#0ca678",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  greenText: { color: "#fff", fontWeight: "700" },
});
