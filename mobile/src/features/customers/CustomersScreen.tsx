import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, FAB, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import { font, useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import type { MoreNav } from "../../navigation/types";
import { CUSTOMER_TYPE_LABEL, useCustomers, useDeleteCustomer, type Customer } from "./api";
import { CustomerFormModal } from "./CustomerFormModal";

export function CustomersScreen() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const nav = useNavigation<MoreNav>();
  const q = useCustomers(search);
  const del = useDeleteCustomer();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const confirmDelete = (c: Customer) =>
    Alert.alert(
      "Eliminar cliente",
      `¿Eliminar "${c.name}"? Se desactivará y dejará de aparecer en la lista.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(c.id, {
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
        keyExtractor={(c) => String(c.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar
              placeholder="Buscar cliente…"
              value={search}
              onChangeText={setSearch}
            />
            <Text style={styles.hint}>Mantén pulsada una fila para eliminar.</Text>
          </View>
        }
        emptyText="No hay clientes."
        renderItem={(c: Customer) => (
          <Card
            onPress={() => nav.navigate("CustomerDetail", { id: c.id, title: c.name })}
            onLongPress={() => confirmDelete(c)}
          >
            <View style={styles.row}>
              <Text style={styles.name}>{c.name}</Text>
              <Badge
                label={c.is_active ? "Activo" : "Inactivo"}
                color={c.is_active ? colors.primary : colors.dimmed}
              />
            </View>
            <Text style={styles.meta}>
              {CUSTOMER_TYPE_LABEL[c.customer_type ?? "person"]}
              {c.phone ? ` · ${c.phone}` : ""}
            </Text>
          </Card>
        )}
      />
      <FAB onPress={() => setFormOpen(true)} />
      <CustomerFormModal visible={formOpen} onClose={() => setFormOpen(false)} customer={null} />
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
