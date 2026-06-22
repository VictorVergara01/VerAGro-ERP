# Productos + Calculadora de Mezcla (Móvil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar al móvil (Expo/React Native) el modelo de lista de productos con dosis por hectárea y la calculadora de mezcla por tanque, igualando el contrato del backend ya desplegado y la fase web ya completada.

**Architecture:** Tres pantallas/feature de `mobile/src/features/field-jobs/` consumen el endpoint `POST /api/field-jobs/calculate-mix/` y el recurso `FieldJob` (con `products[]` anidados). Se regenera el cliente tipado desde el schema del backend, se reescribe `SprayCalculatorScreen` al modelo dosis/ha, se agrega la lista de productos al formulario, y se muestra la lista en el detalle.

**Tech Stack:** Expo, React Native, TypeScript, @tanstack/react-query, openapi-fetch (cliente tipado `src/lib/api/client.ts` + `src/lib/api/schema.d.ts`), componentes UI propios (`LabeledInput`, `Segmented`, `Picker`, `Card`, `LineCard`, `AddRowButton`, `SectionTitle`, `Button`).

## Global Constraints

- Unidades de dosis: **`L/ha`, `cc/ha`, `kg/ha`, `g/ha`** únicamente. NO existe `mL/ha` (cc = mL). Líquidos: L/ha, cc/ha. Granulados: kg/ha, g/ha.
- El usuario ingresa la **tasa de aplicación (caldo) por hectárea**; en la UI la etiqueta es **"Tasa de aplicación (L/ha)"** y mapea al campo del backend `water_per_hectare` (en la calculadora se envía como `caldo_per_hectare`).
- Capacidad del tanque por defecto **200 L**, modificable.
- El gate de calidad del móvil es **`npm run typecheck`** (ejecutar desde `mobile/`). NO hay framework de tests en el móvil — no escribir tests, no ejecutar `npm test`.
- Contrato del endpoint `POST /api/field-jobs/calculate-mix/`:
  - Input: `{ hectares: number, caldo_per_hectare: number, tank_volume_liters: number, products: { name: string, dose_per_hectare: number, unit: string }[] }`
  - Output: `{ total_caldo_liters, liquid_chemical_liters, water_liters, tanks_needed, full_tanks, last_tank_liters, products_total[], per_full_tank[], water_per_full_tank, last_tank[], water_last_tank }` donde cada fila de `products_total`/`per_full_tank`/`last_tank` es `{ name: string, quantity: number, unit: string }` (unit es `"L"` o `"kg"`).
- `FieldJob.products[]` (lectura) es `{ id: number, name: string, dose_per_hectare: string, unit: string }` (DRF serializa Decimal como string).
- Convención de commits: terminar el mensaje con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `mobile/src/lib/api/schema.d.ts` — regenerado por `npm run gen:api` (incluye `FieldJob.products`, `FieldJobProduct`, y el nuevo `FieldJob` sin `application_rate`).
- `mobile/src/features/field-jobs/api.ts` — tipos del feature y hooks; se actualizan `SprayMixProduct`, `SprayMixResult`, `SprayCalcPrefill`, `FieldJobInput`, y el input de `useCalculateMix`. Se agrega `PRODUCT_UNIT_OPTIONS`.
- `mobile/src/navigation/types.ts` — el `prefill` de la ruta `SprayCalculator` gana `caldo_per_hectare` y `products`.
- `mobile/src/features/field-jobs/SprayCalculatorScreen.tsx` — reescritura al modelo dosis/ha y nuevo render de resultados.
- `mobile/src/features/field-jobs/FieldJobFormModal.tsx` — lista de productos editable; se elimina el campo único "Producto aplicado".
- `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx` — card "Productos aplicados"; prefill de la calculadora con caldo + productos; se deja de depender de `application_rate`.

---

### Task 1: Regenerar schema y actualizar tipos del feature

**Files:**
- Modify: `mobile/src/lib/api/schema.d.ts` (regenerado, no editar a mano)
- Modify: `mobile/src/features/field-jobs/api.ts`
- Modify: `mobile/src/navigation/types.ts`

**Interfaces:**
- Consumes: backend en `http://localhost:8000/api/schema/` (debe estar corriendo).
- Produces (para tareas siguientes):
  - `PRODUCT_UNIT_OPTIONS: { value: string; label: string }[]` con `L/ha, cc/ha, kg/ha, g/ha`.
  - `SprayMixProduct = { name: string; dose_per_hectare: number; unit: string }`
  - `SprayMixResultRow = { name: string; quantity: number; unit: string }`
  - `SprayMixResult` con campos: `total_caldo_liters, liquid_chemical_liters, water_liters, tanks_needed, full_tanks, last_tank_liters, products_total[], per_full_tank[], water_per_full_tank, last_tank[], water_last_tank`
  - `SprayCalcPrefill = { hectares?: number; caldo_per_hectare?: number; tank_volume_liters?: number; products?: SprayMixProduct[] }`
  - `FieldJobInput` gana `products?: { name: string; dose_per_hectare: string; unit: string }[]` y pierde `applied_product`.
  - `useCalculateMix` input: `{ hectares: number; caldo_per_hectare: number; tank_volume_liters: number; products: SprayMixProduct[] }`
  - Ruta `SprayCalculator` param `prefill` gana `caldo_per_hectare?: number` y `products?: { name: string; dose_per_hectare: number; unit: string }[]`.

- [ ] **Step 1: Regenerar el schema tipado**

Con el backend corriendo, ejecutar desde `mobile/`:

```bash
npm run gen:api
```

Verificar que `src/lib/api/schema.d.ts` ahora contiene `FieldJobProduct` y que `FieldJob` tiene `products`:

```bash
grep -nE "FieldJobProduct|products\??:" src/lib/api/schema.d.ts | head
```

Expected: aparece `FieldJobProduct:` y dentro de `FieldJob` una propiedad `products`.

- [ ] **Step 2: Actualizar tipos y constantes en `api.ts`**

Reemplazar el bloque de tipos de spray (las interfaces `SprayCalcPrefill`, `SprayMixProduct`, `SprayMixResultRow`, `SprayMixResult` actuales) por:

```ts
export const PRODUCT_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "cc/ha", label: "cc/ha" },
  { value: "kg/ha", label: "kg/ha" },
  { value: "g/ha", label: "g/ha" },
];

export interface SprayMixProduct {
  name: string;
  dose_per_hectare: number;
  unit: string;
}

export interface SprayCalcPrefill {
  hectares?: number;
  caldo_per_hectare?: number;
  tank_volume_liters?: number;
  products?: SprayMixProduct[];
}

export interface SprayMixResultRow {
  name: string;
  quantity: number;
  unit: string;
}

export interface SprayMixResult {
  total_caldo_liters: number;
  liquid_chemical_liters: number;
  water_liters: number;
  tanks_needed: number;
  full_tanks: number;
  last_tank_liters: number;
  products_total: SprayMixResultRow[];
  per_full_tank: SprayMixResultRow[];
  water_per_full_tank: number;
  last_tank: SprayMixResultRow[];
  water_last_tank: number;
}
```

- [ ] **Step 3: Actualizar `FieldJobInput` y `useCalculateMix` en `api.ts`**

En `FieldJobInput`: eliminar la línea `applied_product?: string;` y agregar:

```ts
  products?: { name: string; dose_per_hectare: string; unit: string }[];
```

Reemplazar el cuerpo del input de `useCalculateMix` por el nuevo contrato:

```ts
export function useCalculateMix() {
  return useMutation({
    mutationFn: async (input: {
      hectares: number;
      caldo_per_hectare: number;
      tank_volume_liters: number;
      products: SprayMixProduct[];
    }) => {
      const { data, error } = await api.POST("/api/field-jobs/calculate-mix/", {
        body: input as unknown as never,
      });
      if (error || !data) throw new Error("No se pudo calcular la mezcla.");
      return data as unknown as SprayMixResult;
    },
  });
}
```

- [ ] **Step 4: Actualizar el prefill de la ruta en `navigation/types.ts`**

Reemplazar la línea de la ruta `SprayCalculator` por:

```ts
  SprayCalculator: {
    prefill?: {
      hectares?: number;
      caldo_per_hectare?: number;
      tank_volume_liters?: number;
      products?: { name: string; dose_per_hectare: number; unit: string }[];
    };
  };
```

- [ ] **Step 5: Verificar typecheck**

Desde `mobile/`:

```bash
npm run typecheck
```

Expected: este paso puede dejar errores en `SprayCalculatorScreen.tsx`, `FieldJobFormModal.tsx` y `FieldJobDetailScreen.tsx` (aún usan los campos viejos) — es esperado y se resuelve en las tareas 2-4. NO debe haber errores en `api.ts` ni en `navigation/types.ts`. Confirmar que los únicos errores restantes están en esas tres pantallas.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/api/schema.d.ts mobile/src/features/field-jobs/api.ts mobile/src/navigation/types.ts
git commit -m "feat(field-jobs mobile): tipos dosis/ha y contrato calculate-mix

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Reescribir SprayCalculatorScreen al modelo dosis/ha

**Files:**
- Modify: `mobile/src/features/field-jobs/SprayCalculatorScreen.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `useCalculateMix`, `SprayMixResult`, `PRODUCT_UNIT_OPTIONS` de `./api`; `SprayCalculatorRoute` de `../../navigation/types`.
- Produces: nada (pantalla terminal).

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `SprayCalculatorScreen.tsx` por:

```tsx
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
```

- [ ] **Step 2: Verificar typecheck**

Desde `mobile/`:

```bash
npm run typecheck
```

Expected: sin errores en `SprayCalculatorScreen.tsx`. Pueden quedar errores en `FieldJobFormModal.tsx` y `FieldJobDetailScreen.tsx` (tareas 3-4).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/SprayCalculatorScreen.tsx
git commit -m "feat(field-jobs mobile): calculadora de mezcla por dosis/ha y tanque

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Lista de productos en el formulario móvil

**Files:**
- Modify: `mobile/src/features/field-jobs/FieldJobFormModal.tsx`

**Interfaces:**
- Consumes: `PRODUCT_UNIT_OPTIONS`, `FieldJobInput`, `FieldJob` de `./api`; `LineCard`, `AddRowButton`, `Segmented` de `../../components/ui/form`; `SectionTitle` de `../../components/ui`.
- Produces: nada (componente de UI).

- [ ] **Step 1: Importar utilidades de lista y unidades**

En el import de `../../components/ui/form` agregar `AddRowButton` y `LineCard`; en el import de `../../components/ui` agregar `SectionTitle`. En el import de `./api` agregar `PRODUCT_UNIT_OPTIONS`.

Estado de filas (tipo local) — agregar junto a los demás `useState`:

```tsx
  interface ProductRow { name: string; dose_per_hectare: string; unit: string }
  const [products, setProducts] = useState<ProductRow[]>([]);
```

(Coloca la `interface ProductRow` a nivel de módulo, encima del componente, no dentro del cuerpo.)

- [ ] **Step 2: Eliminar el campo único "Producto aplicado"**

Quitar el estado `const [appliedProduct, setAppliedProduct] = useState("");`, su asignación en el `useEffect` (`setAppliedProduct(job?.applied_product ?? "");`), la propiedad `applied_product: appliedProduct,` del objeto `input` en `submit`, y el `<LabeledInput label="Producto aplicado" ... />` del JSX.

- [ ] **Step 3: Sembrar productos al abrir**

Dentro del `useEffect` que corre cuando `visible`, agregar:

```tsx
      setProducts(
        (job?.products ?? []).map((p) => ({
          name: p.name,
          dose_per_hectare: String(p.dose_per_hectare ?? ""),
          unit: p.unit,
        })),
      );
```

- [ ] **Step 4: Helpers de filas**

Agregar junto a los handlers del componente:

```tsx
  const setProductRow = (i: number, patch: Partial<ProductRow>) =>
    setProducts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addProduct = () => setProducts((ps) => [...ps, { name: "", dose_per_hectare: "", unit: "L/ha" }]);
  const removeProduct = (i: number) => setProducts((ps) => ps.filter((_, idx) => idx !== i));
```

- [ ] **Step 5: Incluir productos en el submit**

En el objeto `input` de `submit`, agregar:

```tsx
      products: products
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dose_per_hectare: String(Number(p.dose_per_hectare) || 0), unit: p.unit })),
```

- [ ] **Step 6: Renderizar la lista en el JSX**

En lugar del antiguo `<LabeledInput label="Producto aplicado" .../>`, insertar (después de "Cultivo"):

```tsx
      <SectionTitle>Productos (dosis por hectárea)</SectionTitle>
      {products.map((p, i) => (
        <LineCard key={i} title={`Producto ${i + 1}`} onRemove={() => removeProduct(i)}>
          <LabeledInput label="Nombre" value={p.name} onChangeText={(v) => setProductRow(i, { name: v })} />
          <LabeledInput
            label="Dosis por hectárea"
            value={p.dose_per_hectare}
            onChangeText={(v) => setProductRow(i, { dose_per_hectare: v })}
            keyboardType="decimal-pad"
          />
          <Segmented
            label="Unidad"
            value={p.unit}
            options={PRODUCT_UNIT_OPTIONS}
            onChange={(v) => setProductRow(i, { unit: v })}
          />
        </LineCard>
      ))}
      <AddRowButton label="Agregar producto" onPress={addProduct} />
```

- [ ] **Step 7: Verificar typecheck**

Desde `mobile/`:

```bash
npm run typecheck
```

Expected: sin errores en `FieldJobFormModal.tsx`. Puede quedar error en `FieldJobDetailScreen.tsx` (Task 4).

- [ ] **Step 8: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobFormModal.tsx
git commit -m "feat(field-jobs mobile): lista de productos en el formulario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Card de productos en el detalle móvil y prefill de la calculadora

**Files:**
- Modify: `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx`

**Interfaces:**
- Consumes: `FieldJob.products`, `job.water_per_hectare`, `job.tank_volume_liters`; navegación a `SprayCalculator` con el nuevo `prefill`.
- Produces: nada (pantalla terminal). Cierra la fase móvil — al terminar, typecheck del móvil debe quedar verde por completo.

- [ ] **Step 1: Reemplazar la fila "Producto" del card de info por un card de productos**

En el primer `<View style={styles.card}>`, eliminar la línea:

```tsx
        <Row label="Producto" value={job.applied_product ?? ""} />
```

Después de ese card (antes del card de hectáreas/precio o tras él, a criterio de orden visual; colócalo justo después del card de hectáreas/precio), insertar:

```tsx
      {job.products && job.products.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Productos aplicados</Text>
          {job.products.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={styles.rowLabel}>{p.name}</Text>
              <Text style={styles.rowValue}>{p.dose_per_hectare} {p.unit}</Text>
            </View>
          ))}
        </View>
      ) : null}
```

- [ ] **Step 2: Dejar de depender de `application_rate` para mostrar la calculadora**

Reemplazar:

```tsx
  const hasApp = job.application_rate != null || job.tank_volume_liters != null;
```

por:

```tsx
  const hasApp =
    job.water_per_hectare != null ||
    job.tank_volume_liters != null ||
    (job.products != null && job.products.length > 0);
```

- [ ] **Step 3: Enviar caldo y productos en el prefill de la calculadora**

En el `navigation.navigate("SprayCalculator", { prefill: {...} })`, reemplazar el objeto `prefill` por:

```tsx
              prefill: {
                hectares: Number(job.hectares) || undefined,
                caldo_per_hectare: job.water_per_hectare != null ? Number(job.water_per_hectare) : undefined,
                tank_volume_liters: job.tank_volume_liters != null ? Number(job.tank_volume_liters) : undefined,
                products: (job.products ?? []).map((p) => ({
                  name: p.name,
                  dose_per_hectare: Number(p.dose_per_hectare),
                  unit: p.unit,
                })),
              },
```

- [ ] **Step 4: Verificar typecheck (verde total)**

Desde `mobile/`:

```bash
npm run typecheck
```

Expected: **sin errores en todo el proyecto móvil**. Si quedan referencias a `application_rate` u otros campos eliminados, corregirlas.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobDetailScreen.tsx
git commit -m "feat(field-jobs mobile): card de productos y prefill de calculadora en el detalle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** lista de productos con dosis/ha (Task 3, form; Task 4, detalle), calculadora dosis/ha con tanque 200 por defecto y agua = caldo − químico (Task 2), unidades L/ha/cc/ha/kg/ha/g/ha (Task 1, `PRODUCT_UNIT_OPTIONS`), tasa de aplicación ingresada por el usuario mapeada a `water_per_hectare` (Task 2 input + Task 4 prefill). Cubierto.
- **Type consistency:** `SprayMixProduct.dose_per_hectare` es `number` en la calculadora/prefill y `string` solo en `FieldJobInput.products` (lo que el backend espera al guardar, como en el web). `SprayMixResult` coincide 1:1 con el contrato del backend. Las filas de resultado usan `quantity`/`unit`.
- **Placeholder scan:** sin TBD/TODO; todo el código está completo.
