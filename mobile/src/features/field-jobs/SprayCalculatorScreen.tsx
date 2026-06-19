import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRoute } from "@react-navigation/native";

import { AddRowButton, LineCard, Segmented } from "../../components/ui/form";
import { Button, Card, LabeledInput, SectionTitle } from "../../components/ui";
import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import type { SprayCalculatorRoute } from "../../navigation/types";
import { useCalculateMix, type SprayMixResult } from "./api";

interface Row {
  name: string;
  dose_per_liter: string;
  dose_unit: string;
}

export function SprayCalculatorScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const route = useRoute<SprayCalculatorRoute>();
  const prefill = route.params?.prefill;
  const calc = useCalculateMix();

  const [hectares, setHectares] = useState(prefill?.hectares != null ? String(prefill.hectares) : "");
  const [water, setWater] = useState(prefill?.water_per_hectare != null ? String(prefill.water_per_hectare) : "");
  const [tank, setTank] = useState(prefill?.tank_volume_liters != null ? String(prefill.tank_volume_liters) : "");
  const [rows, setRows] = useState<Row[]>([{ name: "", dose_per_liter: "", dose_unit: "mL/L" }]);
  const [result, setResult] = useState<SprayMixResult | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: "", dose_per_liter: "", dose_unit: "mL/L" }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const run = () => {
    setResult(null);
    calc.mutate(
      {
        hectares: Number(hectares),
        water_per_hectare: Number(water),
        tank_volume_liters: Number(tank),
        products: rows.map((r) => ({
          name: r.name,
          dose_per_liter: Number(r.dose_per_liter),
          dose_unit: r.dose_unit,
        })),
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
        <LabeledInput label="Agua/ha (L)" value={water} onChangeText={setWater} keyboardType="decimal-pad" />
        <LabeledInput label="Tanque (L)" value={tank} onChangeText={setTank} keyboardType="decimal-pad" />
      </Card>

      <SectionTitle>Productos</SectionTitle>
      {rows.map((r, i) => (
        <LineCard key={i} title={`Producto ${i + 1}`} onRemove={() => removeRow(i)}>
          <LabeledInput label="Nombre" value={r.name} onChangeText={(v) => setRow(i, { name: v })} />
          <LabeledInput
            label="Dosis por litro"
            value={r.dose_per_liter}
            onChangeText={(v) => setRow(i, { dose_per_liter: v })}
            keyboardType="decimal-pad"
          />
          <Segmented
            label="Unidad"
            value={r.dose_unit}
            options={[{ value: "mL/L", label: "mL/L" }, { value: "cc/L", label: "cc/L" }]}
            onChange={(v) => setRow(i, { dose_unit: v })}
          />
        </LineCard>
      ))}
      <AddRowButton label="Agregar producto" onPress={addRow} />

      <Button title={calc.isPending ? "Calculando…" : "Calcular"} onPress={run} disabled={calc.isPending} />

      {result && (
        <Card>
          <Text style={[styles.total, { color: colors.primary }]}>
            Total: {result.total_volume_liters} L en {result.fills_needed} llenados
          </Text>
          <Text style={styles.heading}>Por tanque completo ({tank} L)</Text>
          {result.per_full_fill.map((p, i) => (
            <View key={p.name + i} style={styles.resultRow}>
              <Text style={styles.resultName}>{p.name}</Text>
              <Text style={styles.resultQty}>{p.quantity} {p.unit}</Text>
            </View>
          ))}
          {result.last_fill.length > 0 && (
            <>
              <Text style={styles.heading}>Último llenado ({result.last_fill_liters} L)</Text>
              {result.last_fill.map((p, i) => (
                <View key={p.name + i} style={styles.resultRow}>
                  <Text style={styles.resultName}>{p.name}</Text>
                  <Text style={styles.resultQty}>{p.quantity} {p.unit}</Text>
                </View>
              ))}
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
    total: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
    heading: { fontSize: 13, fontWeight: "700", color: colors.dimmed, marginTop: 8 },
    resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    resultName: { color: colors.text, fontSize: 14 },
    resultQty: { color: colors.text, fontSize: 14, fontWeight: "600" },
  });
