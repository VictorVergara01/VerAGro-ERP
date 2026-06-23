import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRoute } from "@react-navigation/native";

import { AddRowButton, LineCard, Segmented } from "../../components/ui/form";
import { Button, Card, LabeledInput, SectionTitle } from "../../components/ui";
import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import type { SprayCalculatorRoute } from "../../navigation/types";
import { PRODUCT_UNIT_OPTIONS, useCalculateMix, type SprayMixResult } from "./api";

interface Row {
  name: string;
  dose_per_hectare: string;
  unit: string;
}

const emptyRow = (): Row => ({ name: "", dose_per_hectare: "", unit: "L/ha" });

export function SprayCalculatorScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const route = useRoute<SprayCalculatorRoute>();
  const prefill = route.params?.prefill;
  const calc = useCalculateMix();

  const [hectares, setHectares] = useState(prefill?.hectares != null ? String(prefill.hectares) : "");
  const [caldo, setCaldo] = useState(prefill?.caldo_per_hectare != null ? String(prefill.caldo_per_hectare) : "");
  const [tank, setTank] = useState(prefill?.tank_volume_liters != null ? String(prefill.tank_volume_liters) : "200");
  const [rows, setRows] = useState<Row[]>(
    prefill?.products && prefill.products.length > 0
      ? prefill.products.map((p) => ({ name: p.name, dose_per_hectare: String(p.dose_per_hectare), unit: p.unit }))
      : [emptyRow()],
  );
  const [result, setResult] = useState<SprayMixResult | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const run = () => {
    setResult(null);
    calc.mutate(
      {
        hectares: Number(hectares),
        caldo_per_hectare: Number(caldo),
        tank_volume_liters: Number(tank),
        products: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), dose_per_hectare: Number(r.dose_per_hectare), unit: r.unit })),
      },
      {
        onSuccess: setResult,
        onError: (e) => Alert.alert("Error", (e as Error).message),
      },
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <LabeledInput label="Hectáreas" value={hectares} onChangeText={setHectares} keyboardType="decimal-pad" />
        <LabeledInput label="Tasa de aplicación (L/ha)" value={caldo} onChangeText={setCaldo} keyboardType="decimal-pad" />
        <LabeledInput label="Tanque (L)" value={tank} onChangeText={setTank} keyboardType="decimal-pad" />
      </Card>

      <SectionTitle>Productos (dosis por hectárea)</SectionTitle>
      {rows.map((r, i) => (
        <LineCard key={i} title={`Producto ${i + 1}`} onRemove={() => removeRow(i)}>
          <LabeledInput label="Nombre" value={r.name} onChangeText={(v) => setRow(i, { name: v })} />
          <LabeledInput
            label="Dosis por hectárea"
            value={r.dose_per_hectare}
            onChangeText={(v) => setRow(i, { dose_per_hectare: v })}
            keyboardType="decimal-pad"
          />
          <Segmented
            label="Unidad"
            value={r.unit}
            options={PRODUCT_UNIT_OPTIONS}
            onChange={(v) => setRow(i, { unit: v })}
          />
        </LineCard>
      ))}
      <AddRowButton label="Agregar producto" onPress={addRow} />

      <Button title={calc.isPending ? "Calculando…" : "Calcular"} onPress={run} disabled={calc.isPending} />

      {result && (
        <Card>
          <Text style={[styles.total, { color: colors.primary }]}>
            Caldo total: {result.total_caldo_liters} L · {result.tanks_needed} tanque(s)
          </Text>
          <Text style={styles.sub}>
            Químico líquido {result.liquid_chemical_liters} L · agua {result.water_liters} L
          </Text>

          {result.full_tanks > 0 && (
            <>
              <Text style={styles.heading}>Por tanque lleno ({tank} L)</Text>
              {result.per_full_tank.map((p, i) => (
                <View key={p.name + i} style={styles.resultRow}>
                  <Text style={styles.resultName}>{p.name}</Text>
                  <Text style={styles.resultQty}>{p.quantity} {p.unit}</Text>
                </View>
              ))}
              <View style={styles.resultRow}>
                <Text style={styles.resultName}>Agua</Text>
                <Text style={styles.resultQty}>{result.water_per_full_tank} L</Text>
              </View>
            </>
          )}

          {result.last_tank_liters > 0 && (
            <>
              <Text style={styles.heading}>Último tanque ({result.last_tank_liters} L)</Text>
              {result.last_tank.map((p, i) => (
                <View key={p.name + i} style={styles.resultRow}>
                  <Text style={styles.resultName}>{p.name}</Text>
                  <Text style={styles.resultQty}>{p.quantity} {p.unit}</Text>
                </View>
              ))}
              <View style={styles.resultRow}>
                <Text style={styles.resultName}>Agua</Text>
                <Text style={styles.resultQty}>{result.water_last_tank} L</Text>
              </View>
            </>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    total: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    sub: { fontSize: 13, color: colors.dimmed, marginBottom: 4 },
    heading: { fontSize: 13, fontWeight: "700", color: colors.dimmed, marginTop: 8 },
    resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    resultName: { color: colors.text, fontSize: 14 },
    resultQty: { color: colors.text, fontSize: 14, fontWeight: "600" },
  });
