# Módulo Trabajos de Campo (Fumigación) — App Móvil — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a la app móvil (Expo) la pestaña "Campo": listar/crear trabajos de fumigación-esparcido, ver detalle, marcar hecho / cancelar / facturar, capturar GPS, y una calculadora de mezclas — consumiendo la API `/api/field-jobs/` ya existente.

**Architecture:** Nueva feature `mobile/src/features/field-jobs/` que espeja `features/orders/` (api.ts con hooks de TanStack Query + openapi-fetch, pantallas con el toolkit `components/ui`). Se añade una pestaña "Campo" al bottom tab (entre Inicio y Órdenes) con su propio stack: lista → detalle → calculadora; el formulario es un `FormModal`. GPS con `expo-location`.

**Tech Stack:** React Native + Expo SDK 56, React Navigation (bottom-tabs + native-stack), TanStack Query, openapi-fetch, `expo-location`. UI propia (`components/ui`: `Card`, `Picker`, `Segmented`, `FormModal`, `LabeledInput`, `FAB`, etc.). Iconos `@expo/vector-icons` (Ionicons).

## Global Constraints

- Solo `mobile/`. No tocar backend, web. La API `/api/field-jobs/` ya existe y está desplegada.
- **El móvil NO tiene framework de tests.** El gate de cada tarea es `npm run typecheck` (`tsc --noEmit`, desde `mobile/`) **en verde** + (al final) verificación manual en Expo. No hay ciclos TDD con tests; no inventar un runner.
- Tipos desde el schema generado del móvil: `components["schemas"]["FieldJob"]` (import `from "../../lib/api/schema"`). Hay que correr `npm run gen:api` (Task 1) para traerlos.
- Comandos en el HOST desde `mobile/`: `cd /c/Users/victo/Proyectos/VerAgro-ERP/mobile && npm run typecheck` y `npm run gen:api` (apunta a `http://localhost:8000/api/schema/`; el backend está arriba).
- Estados/tipos del trabajo: `JobType` fumigation/spreading; `Status` scheduled→done→invoiced, cancelled. Acciones: `mark-done`, `cancel`, `generate-invoice`, y `calculate-mix` (list).
- Cobro: total lo calcula el servidor; en el form se muestra "Total estimado" en vivo.
- Distribución: el APK se sirve desde la web (ya implementado); este plan NO toca distribución, solo construye la feature. `expo-location` se usa en modo **foreground** ("mientras se usa la app").
- Patrón de import de tipos en móvil: `components["schemas"]["X"]` (no `Schemas[...]`, eso es web).

**Spec de referencia:** `docs/superpowers/specs/2026-06-16-modulo-trabajos-campo-nuway-design.md` §6 (app móvil). Backend y web ya implementados y en `V2.0`.

---

### Task 1: Fundación — schema, expo-location, tipos de navegación y `api.ts`

**Files:**
- Modify: `mobile/src/lib/api/schema.d.ts` (regenerado por `npm run gen:api`)
- Modify: `mobile/package.json` (+ `expo-location` vía `npx expo install`)
- Modify: `mobile/app.json` (permiso `ACCESS_FINE_LOCATION`)
- Modify: `mobile/src/navigation/types.ts` (stack + tab de field-jobs)
- Create: `mobile/src/features/field-jobs/api.ts`

**Interfaces:**
- Produces:
  - Tipos de navegación: `FieldJobsStackParamList` (`FieldJobsList`, `FieldJobDetail: {id; title}`, `SprayCalculator: {prefill?}`), `FieldJobsNav`, `FieldJobDetailRoute`, `SprayCalculatorRoute`; `RootTabParamList` gana `FieldJobsTab: undefined`.
  - `api.ts`: type `FieldJob`; maps `FJ_STATUS_LABEL`, `FJ_STATUS_COLOR`, `JOB_TYPE_LABEL`; hooks `useFieldJobs(all, technicianId)`, `useFieldJob(id)`, `useSaveFieldJob()`, `useFieldJobAction(id)`, `useCalculateMix()`, `useCompany()`; types `FieldJobInput`, `SprayMixProduct`, `SprayMixResult`, `SprayCalcPrefill`.

- [ ] **Step 1: Instalar expo-location y declarar el permiso**

Run (en `mobile/`): `npx expo install expo-location`
En `mobile/app.json`, en `android.permissions`, añadir el permiso de ubicación (queda junto a `RECORD_AUDIO`):

```json
      "permissions": [
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
```

- [ ] **Step 2: Regenerar el schema del móvil**

Con el backend arriba (`http://localhost:8000/api/schema/` → 200), correr (en `mobile/`): `npm run gen:api`
Verificar: `grep -c "FieldJob" src/lib/api/schema.d.ts` ≥ 1.

- [ ] **Step 3: Añadir los tipos de navegación**

En `mobile/src/navigation/types.ts`:
1. Añadir el stack (junto a los demás `*StackParamList`):

```ts
export type FieldJobsStackParamList = {
  FieldJobsList: undefined;
  FieldJobDetail: { id: number; title: string };
  SprayCalculator: { prefill?: { hectares?: number; water_per_hectare?: number; tank_volume_liters?: number } };
};
```

2. En `RootTabParamList`, añadir `FieldJobsTab` como segunda entrada:

```ts
export type RootTabParamList = {
  InicioTab: undefined;
  FieldJobsTab: undefined;
  OrdersTab: undefined;
  InventoryTab: undefined;
  MoreTab: undefined;
};
```

3. Añadir los aliases (junto a `AppNav`/`OrderDetailRoute`):

```ts
export type FieldJobsNav = NativeStackNavigationProp<FieldJobsStackParamList>;
export type FieldJobDetailRoute = RouteProp<FieldJobsStackParamList, "FieldJobDetail">;
export type SprayCalculatorRoute = RouteProp<FieldJobsStackParamList, "SprayCalculator">;
```

- [ ] **Step 4: Crear `api.ts`**

Crear `mobile/src/features/field-jobs/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type FieldJob = components["schemas"]["FieldJob"];

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  fumigation: "Fumigación",
  spreading: "Esparcido / abono",
};

export const FJ_STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  done: "Hecho",
  invoiced: "Facturado",
  cancelled: "Cancelado",
};

export const FJ_STATUS_COLOR: Record<string, string> = {
  scheduled: "#3b82f6",
  done: "#14b8a6",
  invoiced: "#9333ea",
  cancelled: "#ef4444",
};

export interface SprayCalcPrefill {
  hectares?: number;
  water_per_hectare?: number;
  tank_volume_liters?: number;
}

export interface SprayMixProduct {
  name: string;
  dose_per_liter: number;
  dose_unit: string;
}

export interface SprayMixResultRow {
  name: string;
  quantity: number;
  unit: string;
}

export interface SprayMixResult {
  total_volume_liters: number;
  fills_needed: number;
  full_fills: number;
  last_fill_liters: number;
  per_full_fill: SprayMixResultRow[];
  last_fill: SprayMixResultRow[];
}

export interface Company {
  fumigation_price_per_hectare?: string;
  spreading_price_per_quintal?: string;
  drone_tank_volume_liters?: string;
  default_water_per_hectare?: string;
}

export function useCompany() {
  return useQuery({
    queryKey: ["company"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/company/");
      if (error || !data) return {} as Company;
      return data as unknown as Company;
    },
  });
}

export function useFieldJobs(all: boolean, technicianId: number | undefined) {
  return useQuery({
    queryKey: ["field-jobs", all, technicianId],
    queryFn: async () => {
      const query = {
        technician: all ? undefined : technicianId,
      } as { page?: number; technician?: number };
      const { data, error } = await api.GET("/api/field-jobs/", { params: { query } });
      if (error || !data) throw new Error("No se pudieron cargar los trabajos.");
      return (data as unknown as Paginated<FieldJob>).results;
    },
  });
}

export function useFieldJob(id: number | undefined) {
  return useQuery({
    queryKey: ["field-job", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-jobs/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el trabajo.");
      return data as FieldJob;
    },
  });
}

export interface FieldJobInput {
  job_type: string;
  customer: number;
  equipment?: number | null;
  scheduled_date?: string;
  location?: string;
  crop?: string;
  applied_product?: string;
  hectares?: string;
  quintals?: string;
  unit_price?: string;
  notes?: string;
  latitude?: string | null;
  longitude?: string | null;
}

export function useSaveFieldJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FieldJobInput & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/field-jobs/{id}/", {
          params: { path: { id } },
          body: body as unknown as FieldJob,
        });
        if (error || !data) throw new Error("No se pudo guardar el trabajo.");
        return data as FieldJob;
      }
      const { data, error } = await api.POST("/api/field-jobs/", {
        body: body as unknown as FieldJob,
      });
      if (error || !data) throw new Error("No se pudo crear el trabajo.");
      return data as FieldJob;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-jobs"] }),
  });
}

export type FJAction = "mark-done" | "cancel" | "generate-invoice";

export function useFieldJobAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: FJAction) => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as FieldJob;
      const calls: Record<FJAction, () => ReturnType<typeof api.POST>> = {
        "mark-done": () => api.POST("/api/field-jobs/{id}/mark-done/", { params, body: empty }),
        cancel: () => api.POST("/api/field-jobs/{id}/cancel/", { params, body: empty }),
        "generate-invoice": () =>
          api.POST("/api/field-jobs/{id}/generate-invoice/", { params, body: empty }),
      };
      const { data, error } = await calls[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as { invoice_number?: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-job", id] });
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
    },
  });
}

export function useCalculateMix() {
  return useMutation({
    mutationFn: async (input: {
      hectares: number;
      water_per_hectare: number;
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

- [ ] **Step 5: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores. (Las pantallas aún no existen, pero `api.ts` y los tipos de nav compilan solos; `MainTabs` todavía no referencia field-jobs.)

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/api/schema.d.ts mobile/package.json mobile/package-lock.json mobile/app.json mobile/src/navigation/types.ts mobile/src/features/field-jobs/api.ts
git commit -m "feat(field-jobs movil): fundacion (expo-location, tipos nav, api hooks)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `FieldJobFormModal` (alta/edición + GPS)

**Files:**
- Create: `mobile/src/features/field-jobs/FieldJobFormModal.tsx`

**Interfaces:**
- Consumes: `useSaveFieldJob`, `useCompany`, `FieldJobInput`, `FieldJob`, `JOB_TYPE_LABEL` (Task 1); `useCustomers` (`../customers/api`, firma `useCustomers(search: string)`), `useEquipmentList` (`../equipment/api`, firma `useEquipmentList(search: string)`); UI `FormModal`, `Picker`, `Segmented`, `LabeledInput`; `expo-location`.
- Produces: `FieldJobFormModal({ visible, onClose, job? })` where `job?: FieldJob | null`.

- [ ] **Step 1: Implementar el componente**

Crear `mobile/src/features/field-jobs/FieldJobFormModal.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import * as Location from "expo-location";

import { FormModal, Picker, Segmented } from "../../components/ui/form";
import { Button, LabeledInput } from "../../components/ui";
import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import {
  useCompany,
  useSaveFieldJob,
  type FieldJob,
  type FieldJobInput,
} from "./api";

const JOB_TYPES = [
  { value: "fumigation", label: "Fumigación" },
  { value: "spreading", label: "Esparcido" },
];

export function FieldJobFormModal({
  visible,
  onClose,
  job,
}: {
  visible: boolean;
  onClose: () => void;
  job?: FieldJob | null;
}) {
  const save = useSaveFieldJob();
  const customers = useCustomers("");
  const equipments = useEquipmentList("");
  const company = useCompany();
  const editing = Boolean(job?.id);

  const [jobType, setJobType] = useState("fumigation");
  const [customer, setCustomer] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [crop, setCrop] = useState("");
  const [appliedProduct, setAppliedProduct] = useState("");
  const [hectares, setHectares] = useState("");
  const [quintals, setQuintals] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [lat, setLat] = useState<string | null>(null);
  const [lng, setLng] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const priceFor = (t: string) => {
    const c = company.data ?? {};
    return t === "spreading"
      ? c.spreading_price_per_quintal ?? "10"
      : c.fumigation_price_per_hectare ?? "20";
  };

  useEffect(() => {
    if (visible) {
      const t = job?.job_type ?? "fumigation";
      setJobType(t);
      setCustomer(job?.customer ?? null);
      setEquipment(job?.equipment ?? null);
      setLocation(job?.location ?? "");
      setCrop(job?.crop ?? "");
      setAppliedProduct(job?.applied_product ?? "");
      setHectares(job?.hectares ?? "");
      setQuintals(job?.quintals ?? "");
      setUnitPrice(job?.unit_price ?? priceFor(t));
      setNotes(job?.notes ?? "");
      setLat(job?.latitude ?? null);
      setLng(job?.longitude ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, job]);

  const isFumigation = jobType === "fumigation";
  const liveTotal = (Number(isFumigation ? hectares : quintals) || 0) * (Number(unitPrice) || 0);

  const onTypeChange = (t: string) => {
    if (!editing && unitPrice === priceFor(jobType)) setUnitPrice(priceFor(t));
    setJobType(t);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso denegado", "No se pudo acceder a la ubicación.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLat(String(loc.coords.latitude));
      setLng(String(loc.coords.longitude));
    } catch {
      Alert.alert("Error", "No se pudo obtener la ubicación.");
    } finally {
      setLocating(false);
    }
  };

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    const input: FieldJobInput & { id?: number } = {
      id: job?.id,
      job_type: jobType,
      customer,
      equipment,
      location,
      crop,
      applied_product: appliedProduct,
      hectares: String(hectares || 0),
      quintals: String(quintals || 0),
      unit_price: String(unitPrice || 0),
      notes,
      latitude: lat,
      longitude: lng,
    };
    save.mutate(input, {
      onSuccess: onClose,
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={editing ? "Editar trabajo" : "Nuevo trabajo"}
      onSubmit={submit}
      submitting={save.isPending}
      submitLabel="Guardar"
    >
      <Segmented label="Tipo" value={jobType} options={JOB_TYPES} onChange={onTypeChange} />
      <Picker
        label="Cliente"
        value={customer}
        onChange={(v) => setCustomer(v as number | null)}
        options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Picker
        label="Dron"
        value={equipment}
        onChange={(v) => setEquipment(v as number | null)}
        options={(equipments.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
        clearable
        placeholder="Sin asignar"
      />
      <LabeledInput label="Finca / Ubicación" value={location} onChangeText={setLocation} />
      <LabeledInput label="Cultivo" value={crop} onChangeText={setCrop} />
      <LabeledInput label="Producto aplicado" value={appliedProduct} onChangeText={setAppliedProduct} />
      {isFumigation ? (
        <LabeledInput label="Hectáreas" value={hectares} onChangeText={setHectares} keyboardType="decimal-pad" />
      ) : (
        <LabeledInput label="Quintales" value={quintals} onChangeText={setQuintals} keyboardType="decimal-pad" />
      )}
      <LabeledInput
        label={isFumigation ? "Precio/ha ($)" : "Precio/qq ($)"}
        value={unitPrice}
        onChangeText={setUnitPrice}
        keyboardType="decimal-pad"
      />
      <Text style={{ fontWeight: "700" }}>Total estimado: {formatCurrency(liveTotal)}</Text>

      <Button
        title={locating ? "Obteniendo…" : lat ? `📍 ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : "📍 Usar mi ubicación"}
        variant="outline"
        onPress={useMyLocation}
        disabled={locating}
      />
      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
```

Nota (firmas verificadas en `src/components/ui/index.tsx`): `Button` = `{ title, onPress, variant?: "filled" | "outline" | "subtle", color?, icon?, loading?, disabled?, style? }`. `LabeledInput` = `TextInputProps & { label }` (acepta `keyboardType`, `multiline`, `value`, `onChangeText`).

- [ ] **Step 2: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores. Si `Button` no acepta `variant`/`title` con esos nombres, ajustar a la firma real de `components/ui` (revisar `src/components/ui/index.tsx` líneas del `export function Button`).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobFormModal.tsx
git commit -m "feat(field-jobs movil): formulario de alta/edicion con GPS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `SprayCalculatorScreen` (calculadora de mezclas)

**Files:**
- Create: `mobile/src/features/field-jobs/SprayCalculatorScreen.tsx`

**Interfaces:**
- Consumes: `useCalculateMix`, `SprayMixResult`, `SprayMixProduct` (Task 1); nav `SprayCalculatorRoute`; UI `LabeledInput`, `Button`, `Card`, `SectionTitle`, `Picker` or `Segmented`; `expo-clipboard` is NOT required — use `Share`/manual; the screen reads `route.params.prefill`.
- Produces: `SprayCalculatorScreen` (stack screen, route `SprayCalculator`).

- [ ] **Step 1: Implementar la pantalla**

Crear `mobile/src/features/field-jobs/SprayCalculatorScreen.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores. (Confirmar nombres exactos de `Button`/`Card`/`SectionTitle`/`LabeledInput` contra `src/components/ui/index.tsx`; ajustar props si difieren, sin cambiar comportamiento.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/SprayCalculatorScreen.tsx
git commit -m "feat(field-jobs movil): calculadora de mezclas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `FieldJobsScreen` (lista)

**Files:**
- Create: `mobile/src/features/field-jobs/FieldJobsScreen.tsx`

**Interfaces:**
- Consumes: `useFieldJobs`, `FJ_STATUS_COLOR`, `FJ_STATUS_LABEL`, `JOB_TYPE_LABEL`, `FieldJob` (Task 1); `FieldJobFormModal` (Task 2); `useAuth` (`../auth/useAuth`); `formatCurrency`/`formatDate`; nav `FieldJobsNav` (navigates to `FieldJobDetail`).
- Produces: `FieldJobsScreen` (route `FieldJobsList`).

- [ ] **Step 1: Implementar la pantalla**

Crear `mobile/src/features/field-jobs/FieldJobsScreen.tsx` (espeja `orders/MyOrdersScreen.tsx`):

```tsx
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../auth/useAuth";
import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { FieldJobsNav } from "../../navigation/types";
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  JOB_TYPE_LABEL,
  useFieldJobs,
  type FieldJob,
} from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";

function JobCard({ job, onPress }: { job: FieldJob; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const status = job.status ?? "scheduled";
  const qty = job.job_type === "spreading" ? `${job.quintals} qq` : `${job.hectares} ha`;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardNumber}>{job.number}</Text>
        <View style={[styles.badge, { backgroundColor: FJ_STATUS_COLOR[status] }]}>
          <Text style={styles.badgeText}>{FJ_STATUS_LABEL[status] ?? status}</Text>
        </View>
      </View>
      <Text style={styles.cardCustomer}>{job.customer_name}</Text>
      <Text style={styles.cardMeta}>
        {JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} · {job.location || "Sin finca"} · {qty} ·{" "}
        {formatCurrency(job.total)}
      </Text>
      <Text style={styles.cardDate}>{formatDate(job.scheduled_date)}</Text>
    </TouchableOpacity>
  );
}

export function FieldJobsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const navigation = useNavigation<FieldJobsNav>();
  const [all, setAll] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useFieldJobs(all, user?.id);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>{all ? "Todos los trabajos" : "Solo míos"}</Text>
          <Switch value={all} onValueChange={setAll} />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>No se pudieron cargar los trabajos.</Text>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(j) => String(j.id)}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              onPress={() =>
                navigation.navigate("FieldJobDetail", { id: item.id, title: item.number ?? "Trabajo" })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay trabajos de campo.</Text>}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setFormOpen(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      <FieldJobFormModal visible={formOpen} onClose={() => setFormOpen(false)} job={null} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    toolbar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    toggle: { flexDirection: "row", alignItems: "center", gap: 8 },
    toggleLabel: { color: colors.text, fontSize: 14 },
    list: { padding: 16, gap: 12 },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    cardNumber: { fontSize: 16, fontWeight: "700", color: colors.text },
    badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
    cardCustomer: { fontSize: 15, color: colors.text },
    cardMeta: { fontSize: 13, color: colors.dimmed, marginTop: 2 },
    cardDate: { fontSize: 12, color: colors.dimmed, marginTop: 2 },
    empty: { textAlign: "center", color: colors.dimmed, marginTop: 40 },
    error: { textAlign: "center", color: colors.danger, marginTop: 40 },
    fab: {
      position: "absolute",
      right: 16,
      bottom: 16,
      width: 56,
      height: 56,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      elevation: 5,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
  });
```

- [ ] **Step 2: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores. (`navigation.navigate("FieldJobDetail", …)` compila porque `FieldJobsStackParamList` ya declara esa ruta, aunque la pantalla se registre en Task 6.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobsScreen.tsx
git commit -m "feat(field-jobs movil): pantalla de lista con FAB y pull-to-refresh

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `FieldJobDetailScreen` (detalle + acciones)

**Files:**
- Create: `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx`

**Interfaces:**
- Consumes: `useFieldJob`, `useFieldJobAction`, `FJ_STATUS_COLOR`, `FJ_STATUS_LABEL`, `JOB_TYPE_LABEL` (Task 1); `FieldJobFormModal` (Task 2); nav `FieldJobsNav` + `FieldJobDetailRoute` (navigates to `SprayCalculator`); `formatCurrency`/`formatDate`.
- Produces: `FieldJobDetailScreen` (route `FieldJobDetail`).

- [ ] **Step 1: Implementar la pantalla**

Crear `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx` (espeja `orders/OrderDetailScreen.tsx`):

```tsx
import { useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { formatCurrency, formatDate } from "../../utils/format";
import type { FieldJobsNav, FieldJobDetailRoute } from "../../navigation/types";
import { FieldJobFormModal } from "./FieldJobFormModal";
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  JOB_TYPE_LABEL,
  useFieldJob,
  useFieldJobAction,
} from "./api";

function Row({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

export function FieldJobDetailScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const route = useRoute<FieldJobDetailRoute>();
  const navigation = useNavigation<FieldJobsNav>();
  const { id } = route.params;
  const { data: job, isLoading, error } = useFieldJob(id);
  const action = useFieldJobAction(id);
  const [editVisible, setEditVisible] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error || !job) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No se pudo cargar el trabajo.</Text>
      </View>
    );
  }

  const status = job.status ?? "scheduled";
  const isFumigation = job.job_type === "fumigation";

  const run = (a: "mark-done" | "cancel" | "generate-invoice", confirm: string, ok: string) =>
    Alert.alert("Confirmar", confirm, [
      { text: "Volver", style: "cancel" },
      {
        text: "Continuar",
        onPress: () =>
          action.mutate(a, {
            onSuccess: (res) =>
              Alert.alert("Listo", a === "generate-invoice" ? `Factura ${res.invoice_number} generada.` : ok),
            onError: (e) => Alert.alert("Error", (e as Error).message),
          }),
      },
    ]);

  const hasGps = job.latitude != null && job.longitude != null;
  const hasApp = job.application_rate != null || job.tank_volume_liters != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.number}>{job.number}</Text>
        <View style={[styles.badge, { backgroundColor: FJ_STATUS_COLOR[status] }]}>
          <Text style={styles.badgeText}>{FJ_STATUS_LABEL[status] ?? status}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Row label="Cliente" value={job.customer_name ?? ""} />
        <Row label="Dron" value={job.equipment_name || "Sin asignar"} />
        <Row label="Técnico" value={job.technician_name || "Sin asignar"} />
        <Row label="Tipo" value={JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} />
        <Row label="Finca" value={job.location ?? ""} />
        <Row label="Cultivo" value={job.crop ?? ""} />
        <Row label="Producto" value={job.applied_product ?? ""} />
        <Row label="Programado" value={formatDate(job.scheduled_date)} />
        {job.done_date ? <Row label="Hecho" value={formatDate(job.done_date)} /> : null}
      </View>

      <View style={styles.card}>
        <Row label={isFumigation ? "Hectáreas" : "Quintales"} value={isFumigation ? String(job.hectares) : String(job.quintals)} />
        <Row label={isFumigation ? "Precio/ha" : "Precio/qq"} value={formatCurrency(job.unit_price)} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(job.total)}</Text>
        </View>
      </View>

      {hasApp ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() =>
            navigation.navigate("SprayCalculator", {
              prefill: {
                hectares: Number(job.hectares) || undefined,
                water_per_hectare: job.water_per_hectare != null ? Number(job.water_per_hectare) : undefined,
                tank_volume_liters: job.tank_volume_liters != null ? Number(job.tank_volume_liters) : undefined,
              },
            })
          }
        >
          <Text style={styles.linkText}>Calculadora de mezcla ›</Text>
        </TouchableOpacity>
      ) : null}

      {hasGps ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${job.latitude},${job.longitude}`)}
        >
          <Text style={styles.linkText}>Abrir ubicación en Maps ›</Text>
        </TouchableOpacity>
      ) : null}

      {job.notes ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notas</Text>
          <Text style={styles.bodyText}>{job.notes}</Text>
        </View>
      ) : null}

      {status === "scheduled" ? (
        <>
          <TouchableOpacity style={styles.docBtn} onPress={() => setEditVisible(true)}>
            <Text style={styles.docText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => run("mark-done", "¿Marcar como hecho?", "Marcado como hecho.")}
            disabled={action.isPending}
          >
            <Text style={styles.actionText}>Marcar hecho</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => run("cancel", "¿Cancelar el trabajo?", "Trabajo cancelado.")}>
            <Text style={styles.cancelText}>Cancelar trabajo</Text>
          </TouchableOpacity>
        </>
      ) : status === "done" ? (
        <>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => run("generate-invoice", "¿Generar la factura?", "Factura generada.")}
            disabled={action.isPending}
          >
            <Text style={styles.actionText}>Facturar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => run("cancel", "¿Cancelar el trabajo?", "Trabajo cancelado.")}>
            <Text style={styles.cancelText}>Cancelar trabajo</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.dimmedCenter}>No hay acciones disponibles en este estado.</Text>
      )}

      <FieldJobFormModal visible={editVisible} onClose={() => setEditVisible(false)} job={job} />
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
    error: { color: colors.danger },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    number: { fontSize: 20, fontWeight: "700", color: colors.text },
    badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    rowLabel: { color: colors.dimmed, fontSize: 14 },
    rowValue: { color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 8 },
    bodyText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    totalLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
    totalValue: { fontSize: 15, fontWeight: "700", color: colors.text },
    linkBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
    linkText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
    docBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.primary, alignItems: "center" },
    docText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
    actionBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
    actionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    cancelBtn: { padding: 14, alignItems: "center", marginTop: 4 },
    cancelText: { color: colors.danger, fontSize: 15, fontWeight: "700" },
    dimmedCenter: { color: colors.dimmed, fontSize: 14, textAlign: "center", marginTop: 8 },
  });
```

- [ ] **Step 2: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobDetailScreen.tsx
git commit -m "feat(field-jobs movil): pantalla de detalle con acciones y GPS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Pestaña "Campo" en el tab bar (wiring)

**Files:**
- Modify: `mobile/src/navigation/MainTabs.tsx`

**Interfaces:**
- Consumes: todas las pantallas anteriores; los tipos de nav (Task 1).
- Produces: pestaña "Campo" (segunda, icono `leaf`) con stack `FieldJobsList` → `FieldJobDetail` → `SprayCalculator`.

- [ ] **Step 1: Registrar el navigator y la pestaña**

En `mobile/src/navigation/MainTabs.tsx`:
1. Imports nuevos (junto a los demás):

```tsx
import { FieldJobsScreen } from "../features/field-jobs/FieldJobsScreen";
import { FieldJobDetailScreen } from "../features/field-jobs/FieldJobDetailScreen";
import { SprayCalculatorScreen } from "../features/field-jobs/SprayCalculatorScreen";
import type { FieldJobsStackParamList } from "./types";
```

2. Definir el navigator (junto a los demás `*Navigator`, p. ej. tras `DashboardNavigator`):

```tsx
const FieldJobsStack = createNativeStackNavigator<FieldJobsStackParamList>();
function FieldJobsNavigator() {
  const { colors } = useTheme();
  return (
    <FieldJobsStack.Navigator screenOptions={makeStackOptions(colors)}>
      <FieldJobsStack.Screen
        name="FieldJobsList"
        component={FieldJobsScreen}
        options={{ title: "Trabajos de campo" }}
      />
      <FieldJobsStack.Screen
        name="FieldJobDetail"
        component={FieldJobDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <FieldJobsStack.Screen
        name="SprayCalculator"
        component={SprayCalculatorScreen}
        options={{ title: "Calculadora de mezcla" }}
      />
    </FieldJobsStack.Navigator>
  );
}
```

3. En `MainTabs`, añadir el `Tab.Screen` como **segunda** pestaña, entre `InicioTab` y `OrdersTab`:

```tsx
      <Tab.Screen
        name="FieldJobsTab"
        component={FieldJobsNavigator}
        options={{
          title: "Campo",
          tabBarIcon: ({ color, size }) => <Ionicons name="leaf" size={size} color={color} />,
        }}
      />
```

- [ ] **Step 2: Typecheck**

Run (en `mobile/`): `npm run typecheck`
Expected: 0 errores. Todas las pantallas existen y el `RootTabParamList` ya tiene `FieldJobsTab`.

- [ ] **Step 3: Verificación manual (Expo)**

Levantar el bundler (si no está): en `mobile/`, `npx expo start` (o el flujo que uses con el dispositivo/emulador). Confirmar: aparece la pestaña **Campo** (icono hoja, 2.ª posición); la lista carga; FAB abre el formulario; crear un trabajo; entrar al detalle; **Marcar hecho** → **Facturar**; el botón "📍 Usar mi ubicación" pide permiso y rellena lat/lon; "Calculadora de mezcla" abre y calcula; "Abrir en Maps" abre el mapa. Capturar cualquier problema.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/navigation/MainTabs.tsx
git commit -m "feat(field-jobs movil): pestana Campo en el tab bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 → 2 → 3 → 4 → 5 → 6. Los tipos de navegación (Task 1) deben existir antes de que las pantallas tipecheckeen. El wiring del tab (Task 6) conecta todo al final.
- **Gate por tarea:** `npm run typecheck` en verde (el móvil no tiene tests). La verificación de comportamiento real es manual en Expo (Task 6, Step 3).
- **Confirmar firmas de UI al implementar:** `Button`, `Card`, `LabeledInput`, `SectionTitle` viven en `mobile/src/components/ui/index.tsx`; `FormModal`, `Picker`, `Segmented`, `LineCard`, `AddRowButton` en `mobile/src/components/ui/form.tsx`. Si alguna prop difiere de lo escrito aquí (p. ej. `Button` usa `label` en vez de `title`, o `variant` distinto), ajustar a la firma real **sin cambiar el comportamiento**.
- **Tras editar `app.json`/instalar `expo-location`:** un nuevo APK requiere recompilar con EAS (`--profile preview`) — eso es del momento de publicar, no del desarrollo (en Expo Go / dev client el permiso ya aplica).
- **Fuera de alcance (follow-ups):** exportación MIDA, persistir mezcla calculada, descuento de inventario, múltiples operadores, vista de mapa embebida, notificaciones push, modo offline.
```
