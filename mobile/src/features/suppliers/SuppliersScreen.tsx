import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, FAB, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import { font, useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import type { MoreNav } from "../../navigation/types";
import { useDeleteSupplier, useSuppliers, type Supplier } from "./api";
import { SupplierFormModal } from "./SupplierFormModal";

export function SuppliersScreen() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const nav = useNavigation<MoreNav>();
  const q = useSuppliers(search);
  const del = useDeleteSupplier();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const confirmDelete = (s: Supplier) =>
    Alert.alert(
      "Eliminar proveedor",
      `¿Eliminar "${s.name}"? Se desactivará y dejará de aparecer en la lista.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(s.id, {
              onError: (e) => Alert.alert("Error", (e as Error).message),
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
        keyExtractor={(s) => String(s.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar placeholder="Buscar proveedor…" value={search} onChangeText={setSearch} />
            <Text style={styles.hint}>Mantén pulsada una fila para eliminar.</Text>
          </View>
        }
        emptyText="No hay proveedores."
        renderItem={(s: Supplier) => (
          <Card
            onPress={() => nav.navigate("SupplierDetail", { id: s.id, title: s.name })}
            onLongPress={() => confirmDelete(s)}
          >
            <View style={styles.row}>
              <Text style={styles.name}>{s.name}</Text>
              <Badge
                label={s.is_active ? "Activo" : "Inactivo"}
                color={s.is_active ? colors.primary : colors.dimmed}
              />
            </View>
            <Text style={styles.meta}>
              {s.contact_person || "—"}
              {s.country ? ` · ${s.country}` : ""}
            </Text>
          </Card>
        )}
      />
      <FAB onPress={() => setFormOpen(true)} />
      <SupplierFormModal visible={formOpen} onClose={() => setFormOpen(false)} supplier={null} />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    name: { fontSize: font.md, fontWeight: "700", color: colors.text, flexShrink: 1 },
    meta: { fontSize: font.sm, color: colors.dimmed, marginTop: 2 },
    hint: { fontSize: font.xs, color: colors.dimmed, marginTop: 6, fontStyle: "italic" },
  });
