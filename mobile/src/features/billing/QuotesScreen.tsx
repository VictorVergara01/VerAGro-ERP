import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import { colors, font, quoteStatusColors, quoteStatusLabels } from "../../theme";
import { formatCurrency } from "../../utils/format";
import type { MoreNav } from "../../navigation/types";
import { useQuotes, type Quote } from "./api";

export function QuotesScreen() {
  const [search, setSearch] = useState("");
  const nav = useNavigation<MoreNav>();
  const q = useQuotes(search);

  return (
    <Screen padded={false}>
      <ListView
        items={q.data ?? []}
        loading={q.isLoading}
        error={q.error}
        refetch={q.refetch}
        isRefetching={q.isRefetching}
        keyExtractor={(x) => String(x.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar placeholder="Buscar cotización…" value={search} onChangeText={setSearch} />
          </View>
        }
        emptyText="No hay cotizaciones."
        renderItem={(x: Quote) => {
          const st = x.status ?? "draft";
          return (
            <Card onPress={() => nav.navigate("QuoteDetail", { id: x.id, title: x.quote_number ?? "Cotización" })}>
              <View style={styles.row}>
                <Text style={styles.num}>{x.quote_number}</Text>
                <Badge label={quoteStatusLabels[st] ?? st} color={quoteStatusColors[st] ?? colors.dimmed} />
              </View>
              <View style={styles.row}>
                <Text style={styles.meta}>{x.customer_name ?? "—"}</Text>
                <Text style={styles.total}>{formatCurrency(x.total)}</Text>
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  num: { fontSize: font.md, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.dimmed, marginTop: 2 },
  total: { fontSize: font.md, fontWeight: "700", color: colors.text, marginTop: 2 },
});
