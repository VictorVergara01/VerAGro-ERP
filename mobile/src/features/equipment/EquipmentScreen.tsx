import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, FAB, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import { colors, font } from "../../theme";
import type { MoreNav } from "../../navigation/types";
import {
  EQ_STATUS_COLOR,
  EQ_STATUS_LABEL,
  useDeleteEquipment,
  useEquipmentList,
  type Equipment,
} from "./api";
import { EquipmentFormModal } from "./EquipmentFormModal";

export function EquipmentScreen() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const nav = useNavigation<MoreNav>();
  const q = useEquipmentList(search);
  const del = useDeleteEquipment();

  const confirmDelete = (eq: Equipment) =>
    Alert.alert(
      "Eliminar equipo",
      `¿Eliminar "${eq.name}"? Se marcará como retirado.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(eq.id, {
              onError: (err) => Alert.alert("Error", (err as Error).message),
            }),
        },
      ],
    );

  return (
    <Screen padded={false}>
      <ListView
        items={q.data ?? []}
        loading={q.isLoading}
        error={q.error}
        refetch={q.refetch}
        isRefetching={q.isRefetching}
        keyExtractor={(e) => String(e.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar placeholder="Buscar equipo…" value={search} onChangeText={setSearch} />
            <Text style={styles.hint}>Mantén pulsada una fila para eliminar.</Text>
          </View>
        }
        emptyText="No hay equipos."
        renderItem={(e: Equipment) => (
          <Card
            onPress={() => nav.navigate("EquipmentDetail", { id: e.id, title: e.name })}
            onLongPress={() => confirmDelete(e)}
          >
            <View style={styles.row}>
              <Text style={styles.name}>{e.name}</Text>
              <Badge
                label={EQ_STATUS_LABEL[e.status ?? "active"] ?? e.status ?? ""}
                color={EQ_STATUS_COLOR[e.status ?? "active"] ?? colors.dimmed}
              />
            </View>
            <Text style={styles.meta}>
              {e.equipment_type_name ?? "—"}
              {e.customer_name ? ` · ${e.customer_name}` : ""}
            </Text>
          </Card>
        )}
      />
      <FAB onPress={() => setFormOpen(true)} />
      <EquipmentFormModal visible={formOpen} onClose={() => setFormOpen(false)} equipment={null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: font.md, fontWeight: "700", color: colors.text, flexShrink: 1 },
  meta: { fontSize: font.sm, color: colors.dimmed, marginTop: 2 },
  hint: { fontSize: font.xs, color: colors.dimmed, marginTop: 6, fontStyle: "italic" },
});
