import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";
import { Screen } from "../../components/ui/Screen";
import { Card, DetailRow, ErrorState, Loading, SectionTitle } from "../../components/ui";
import { colors, font } from "../../theme";
import { formatCurrency } from "../../utils/format";
import { useDashboard } from "../dashboard/api";

type Product = components["schemas"]["Product"];

function useLowStock() {
  return useQuery({
    queryKey: ["low-stock"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/low-stock/");
      if (error || !data) throw new Error("error");
      return data as unknown as Product[];
    },
  });
}

export function ReportsScreen() {
  const dash = useDashboard();
  const low = useLowStock();

  if (dash.isLoading) return <Loading />;
  if (dash.error || !dash.data) {
    const forbidden = (dash.error as Error)?.message === "forbidden";
    return (
      <Screen>
        <ErrorState
          text={forbidden ? "Tu rol no tiene acceso a los reportes." : "No se pudieron cargar los reportes."}
        />
      </Screen>
    );
  }

  const d = dash.data;
  return (
    <Screen scroll refreshing={dash.isRefetching} onRefresh={() => void dash.refetch()}>
      <Card>
        <SectionTitle>Resumen financiero</SectionTitle>
        <DetailRow label="Ventas del mes" value={formatCurrency(d.invoices.sales_this_month)} strong />
        <DetailRow label="Facturas pendientes" value={String(d.invoices.pending_count)} />
        <DetailRow label="Por cobrar" value={formatCurrency(d.invoices.pending_amount)} />
        <DetailRow label="Valor de inventario" value={formatCurrency(d.inventory.total_stock_value)} />
        <DetailRow label="Productos en catálogo" value={String(d.inventory.total_products)} />
      </Card>

      <Card>
        <SectionTitle>Piezas bajo stock ({d.inventory.low_stock_count})</SectionTitle>
        {low.isLoading ? (
          <Loading />
        ) : (low.data ?? []).length === 0 ? (
          <Text style={styles.empty}>Todo el stock está por encima del mínimo.</Text>
        ) : (
          (low.data ?? []).map((p) => {
            const available = p.available_quantity ?? p.stock_quantity;
            return (
              <View key={p.id} style={styles.lowRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lowName}>{p.name}</Text>
                  <Text style={styles.lowMeta}>{p.sku}</Text>
                </View>
                <Text style={styles.lowQty}>
                  {available} / mín {p.minimum_stock}
                </Text>
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.dimmed, fontSize: font.sm },
  lowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  lowName: { fontSize: font.md, color: colors.text },
  lowMeta: { fontSize: font.sm, color: colors.dimmed },
  lowQty: { fontSize: font.sm, fontWeight: "700", color: colors.danger },
});
