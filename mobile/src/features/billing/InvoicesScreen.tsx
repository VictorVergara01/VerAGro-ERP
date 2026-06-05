import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../../components/ui/Screen";
import { Badge, Card, SearchBar } from "../../components/ui";
import { ListView } from "../../components/ui/ListView";
import {
  colors,
  font,
  invoiceStatusColors,
  invoiceStatusLabels,
} from "../../theme";
import { formatCurrency } from "../../utils/format";
import type { MoreNav } from "../../navigation/types";
import { INVOICE_TYPE_LABEL, useInvoices, type Invoice } from "./api";

export function InvoicesScreen() {
  const [search, setSearch] = useState("");
  const nav = useNavigation<MoreNav>();
  const q = useInvoices(search);

  return (
    <Screen padded={false}>
      <ListView
        items={q.data ?? []}
        loading={q.isLoading}
        error={q.error}
        refetch={q.refetch}
        isRefetching={q.isRefetching}
        keyExtractor={(i) => String(i.id)}
        header={
          <View style={{ marginBottom: 12 }}>
            <SearchBar placeholder="Buscar factura…" value={search} onChangeText={setSearch} />
          </View>
        }
        emptyText="No hay facturas."
        renderItem={(i: Invoice) => {
          const st = i.status ?? "draft";
          return (
            <Card onPress={() => nav.navigate("InvoiceDetail", { id: i.id, title: i.invoice_number ?? "Factura" })}>
              <View style={styles.row}>
                <Text style={styles.num}>{i.invoice_number}</Text>
                <Badge label={invoiceStatusLabels[st] ?? st} color={invoiceStatusColors[st] ?? colors.dimmed} />
              </View>
              <Text style={styles.meta}>
                {i.customer_name ?? "—"} · {INVOICE_TYPE_LABEL[i.invoice_type ?? "service_invoice"]}
              </Text>
              <View style={styles.row}>
                <Text style={styles.meta}>Total {formatCurrency(i.total)}</Text>
                <Text style={styles.balance}>Saldo {formatCurrency(i.balance_due)}</Text>
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
  balance: { fontSize: font.sm, fontWeight: "700", color: colors.text, marginTop: 2 },
});
