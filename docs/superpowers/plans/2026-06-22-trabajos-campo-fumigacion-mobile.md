# Trabajos de Campo (Fumigación) — Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaptar el frontend móvil (Expo/React Native) del módulo de Trabajos de Campo al backend reconstruido: formulario y detalle solo-fumigación, cultivo como selector (arroz/maíz/pasto/otros), químicos L/ha·cc/ha con tope de 10, y quitar todas las referencias a campos eliminados (quintales, GPS, tipo, producto único, clima).

**Architecture:** El backend ya cambió y el schema tipado móvil fue regenerado (`npm run gen:api` → `FieldJob` con `crop` (CropEnum), `crop_display`, `crop_other`; sin `applied_product`, `quintals`, `latitude`, `longitude`, clima). Se actualizan `api.ts` (constantes + `FieldJobInput`) y las 3 pantallas del feature. La pantalla `SprayCalculatorScreen` NO cambia (solo verá 2 unidades).

**Tech Stack:** Expo SDK 56 + React Native + TypeScript + @tanstack/react-query + openapi-fetch. UI propia (`Segmented`, `Picker`, `LineCard`, `AddRowButton`, `LabeledInput`, `SectionTitle`, `Card`, `Button`). Gate: `npm run typecheck` desde `mobile/`. **No hay framework de tests** — no escribir tests, no `npm test`.

## Global Constraints

- Rama `V2.0`; **no** mergear a master sin pedido explícito.
- **Solo fumigación** en la UI móvil: sin selector de tipo, sin quintales, sin GPS ("usar mi ubicación" / Maps). `job_type` se envía siempre `"fumigation"`.
- Cultivo: selector **Arroz/Maíz/Pasto/Otros** (valores `rice`/`corn`/`pasture`/`other`); al elegir **Otros** se muestra un texto libre que mapea a `crop_other`. Default `rice`.
- Químicos: unidades **L/ha y cc/ha**; hasta **10** (el botón "Agregar producto" solo se muestra con menos de 10; al llegar a 10 se muestra un aviso).
- Tanque y tasa de aplicación se prellenan desde `useCompany()` cuando aplique (la calculadora ya lo hace).
- Quitar referencias a campos eliminados: `quintals`, `applied_product`, `latitude`, `longitude`, clima.
- El gate es `npm run typecheck` (0 errores). Sin tests.
- Commits en español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `mobile/src/lib/api/schema.d.ts` — ya regenerado; se commitea con Task 1.
- `mobile/src/features/field-jobs/api.ts` — `CROP_OPTIONS`; `PRODUCT_UNIT_OPTIONS` reducido a L/ha·cc/ha; `FieldJobInput` sin quintals/lat/long, con `crop_other`.
- `mobile/src/features/field-jobs/FieldJobFormModal.tsx` — formulario solo-fumigación (reescritura).
- `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx` — detalle limpio.
- `mobile/src/features/field-jobs/FieldJobsScreen.tsx` — lista limpia.

**Nota:** Task 1 deja el typecheck en ROJO a propósito (las pantallas usan campos viejos); queda VERDE al terminar Task 4.

---

### Task 1: api.ts — cultivo, unidades líquidas y FieldJobInput limpio

**Files:**
- Modify: `mobile/src/features/field-jobs/api.ts`
- Modify (commit): `mobile/src/lib/api/schema.d.ts` (ya regenerado)

**Interfaces:**
- Produces: `CROP_OPTIONS: {value:string;label:string}[]` (rice/corn/pasture/other); `PRODUCT_UNIT_OPTIONS` solo L/ha·cc/ha; `FieldJobInput` sin `quintals`/`latitude`/`longitude`, con `crop_other?: string`.

- [ ] **Step 1: Agregar CROP_OPTIONS y reducir PRODUCT_UNIT_OPTIONS**

En `mobile/src/features/field-jobs/api.ts`, reemplazar el bloque actual de `PRODUCT_UNIT_OPTIONS` por:

```ts
export const CROP_OPTIONS = [
  { value: "rice", label: "Arroz" },
  { value: "corn", label: "Maíz" },
  { value: "pasture", label: "Pasto" },
  { value: "other", label: "Otros" },
];

// Solo líquidos para fumigación (el backend conserva kg/ha y g/ha para sólidos).
export const PRODUCT_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "cc/ha", label: "cc/ha" },
];
```

- [ ] **Step 2: Limpiar FieldJobInput**

En `mobile/src/features/field-jobs/api.ts`, reemplazar la interfaz `FieldJobInput` por (quita `quintals`, `latitude`, `longitude`; agrega `crop_other`):

```ts
export interface FieldJobInput {
  job_type: string;
  customer: number;
  equipment?: number | null;
  technician?: number | null;
  scheduled_date?: string;
  location?: string;
  crop?: string;
  crop_other?: string;
  products?: { name: string; dose_per_hectare: string; unit: string }[];
  hectares?: string;
  unit_price?: string;
  notes?: string;
}
```

- [ ] **Step 3: Verificar que api.ts no tiene errores propios**

Run: `npm --prefix C:/Users/victo/Proyectos/VerAgro-ERP/mobile run typecheck 2>&1 | grep "field-jobs/api.ts" || echo "api.ts OK"`
Expected: `api.ts OK` (los errores restantes están en las pantallas, no en api.ts).

- [ ] **Step 4: Commit (schema + api.ts)**

```bash
git add mobile/src/lib/api/schema.d.ts mobile/src/features/field-jobs/api.ts
git commit -m "feat(field-jobs mobile): schema regenerado y cultivo/unidades liquidas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: FieldJobFormModal — formulario solo-fumigación

**Files:**
- Modify: `mobile/src/features/field-jobs/FieldJobFormModal.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `CROP_OPTIONS`, `PRODUCT_UNIT_OPTIONS`, `FieldJobInput`, `FieldJob`, `useCompany`, `useSaveFieldJob` de `./api`; `Segmented`, `Picker`, `LineCard`, `AddRowButton`, `FormModal` de `../../components/ui/form`; `LabeledInput`, `SectionTitle`, `Button` de `../../components/ui`.

- [ ] **Step 1: Reescribir el formulario**

Reemplazar todo el contenido de `mobile/src/features/field-jobs/FieldJobFormModal.tsx` por:

```tsx
import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";

import { AddRowButton, FormModal, LineCard, Picker, Segmented } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import { formatCurrency } from "../../utils/format";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { useAuth } from "../auth/useAuth";
import {
  CROP_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
  useCompany,
  useSaveFieldJob,
  type FieldJob,
  type FieldJobInput,
} from "./api";

const MAX_PRODUCTS = 10;

interface ProductRow {
  name: string;
  dose_per_hectare: string;
  unit: string;
}

export function FieldJobFormModal({
  visible,
  onClose,
  job,
}: {
  visible: boolean;
  onClose: () => void;
  job?: FieldJob | null;
}) {
  const { user } = useAuth();
  const save = useSaveFieldJob();
  const customers = useCustomers("");
  const equipments = useEquipmentList("");
  const company = useCompany();
  const editing = Boolean(job?.id);

  const [customer, setCustomer] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [crop, setCrop] = useState("rice");
  const [cropOther, setCropOther] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [hectares, setHectares] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");

  const defaultPrice = () => company.data?.fumigation_price_per_hectare ?? "20";

  useEffect(() => {
    if (visible) {
      setCustomer(job?.customer ?? null);
      setEquipment(job?.equipment ?? null);
      setLocation(job?.location ?? "");
      setCrop(job?.crop ?? "rice");
      setCropOther(job?.crop_other ?? "");
      setProducts(
        (job?.products ?? []).map((p) => ({
          name: p.name,
          dose_per_hectare: String(p.dose_per_hectare ?? ""),
          unit: p.unit ?? "L/ha",
        })),
      );
      setHectares(job?.hectares ?? "1");
      setUnitPrice(job?.unit_price ?? defaultPrice());
      setNotes(job?.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, job]);

  const liveTotal = (Number(hectares) || 0) * (Number(unitPrice) || 0);

  const setProductRow = (i: number, patch: Partial<ProductRow>) =>
    setProducts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addProduct = () => setProducts((ps) => [...ps, { name: "", dose_per_hectare: "", unit: "L/ha" }]);
  const removeProduct = (i: number) => setProducts((ps) => ps.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    const input: FieldJobInput & { id?: number } = {
      id: job?.id,
      job_type: "fumigation",
      customer,
      equipment,
      technician: job?.technician ?? user?.id ?? null,
      location,
      crop,
      crop_other: crop === "other" ? cropOther : "",
      products: products
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dose_per_hectare: String(Number(p.dose_per_hectare) || 0), unit: p.unit })),
      hectares: String(hectares || 0),
      unit_price: String(unitPrice || 0),
      notes,
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
      <Segmented label="Cultivo" value={crop} options={CROP_OPTIONS} onChange={setCrop} />
      {crop === "other" && (
        <LabeledInput label="Especifica el cultivo" value={cropOther} onChangeText={setCropOther} />
      )}

      <SectionTitle>Químicos (dosis por hectárea)</SectionTitle>
      {products.map((p, i) => (
        <LineCard key={i} title={`Químico ${i + 1}`} onRemove={() => removeProduct(i)}>
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
      {products.length < MAX_PRODUCTS ? (
        <AddRowButton label="Agregar químico" onPress={addProduct} />
      ) : (
        <Text style={{ color: "#888", marginTop: 8 }}>Máximo {MAX_PRODUCTS} químicos por trabajo.</Text>
      )}

      <LabeledInput label="Hectáreas" value={hectares} onChangeText={setHectares} keyboardType="decimal-pad" />
      <LabeledInput label="Precio/ha ($)" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
      <Text style={{ fontWeight: "700" }}>Total estimado: {formatCurrency(liveTotal)}</Text>

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
```

- [ ] **Step 2: Verificar typecheck del formulario**

Run: `npm --prefix C:/Users/victo/Proyectos/VerAgro-ERP/mobile run typecheck 2>&1 | grep "FieldJobFormModal" || echo "FieldJobFormModal OK"`
Expected: `FieldJobFormModal OK` (pueden quedar errores en DetailScreen/FieldJobsScreen, Tasks 3-4).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobFormModal.tsx
git commit -m "feat(field-jobs mobile): formulario solo-fumigacion con cultivo y tope de 10

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: FieldJobDetailScreen — detalle limpio

**Files:**
- Modify: `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx`

**Interfaces:**
- Consumes: `FieldJob` (con `crop_display`/`crop_other`, sin `quintals`/`latitude`/`longitude`/`job_type`-en-UI).

- [ ] **Step 1: Quitar el import de `Linking` y de `JOB_TYPE_LABEL`**

En `mobile/src/features/field-jobs/FieldJobDetailScreen.tsx`:
- En el import de `react-native`, quitar `Linking` (ya no se usa el enlace a Maps).
- En el import de `./api`, quitar `JOB_TYPE_LABEL`.

- [ ] **Step 2: Quitar `isFumigation` y `hasGps`; calcular `cropLabel`**

Reemplazar las líneas:
```tsx
  const isFumigation = job.job_type === "fumigation";
```
y
```tsx
  const hasGps = job.latitude != null && job.longitude != null;
  const hasApp =
```
por:
```tsx
  const cropLabel = job.crop === "other" ? (job.crop_other || "Otros") : (job.crop_display || "—");
```
…dejando `const hasApp =` con su valor (mantener el cálculo de `hasApp` tal cual está, solo se elimina la línea de `hasGps` que estaba encima). Es decir, el bloque queda:
```tsx
  const cropLabel = job.crop === "other" ? (job.crop_other || "Otros") : (job.crop_display || "—");
  const hasApp =
    job.water_per_hectare != null ||
    job.tank_volume_liters != null ||
    (job.products != null && job.products.length > 0);
```

- [ ] **Step 3: Limpiar el card de info (quitar Tipo, usar cropLabel)**

Reemplazar el primer `<View style={styles.card}>` de info por:
```tsx
      <View style={styles.card}>
        <Row label="Cliente" value={job.customer_name ?? ""} />
        <Row label="Dron" value={job.equipment_name || "Sin asignar"} />
        <Row label="Piloto" value={job.technician_name || "Sin asignar"} />
        <Row label="Finca" value={job.location ?? ""} />
        <Row label="Cultivo" value={cropLabel} />
        <Row label="Programado" value={formatDate(job.scheduled_date)} />
        {job.done_date ? <Row label="Hecho" value={formatDate(job.done_date)} /> : null}
      </View>
```

- [ ] **Step 4: Limpiar el card de cantidades (sin quintales)**

Reemplazar el segundo `<View style={styles.card}>` (Hectáreas/Quintales) por:
```tsx
      <View style={styles.card}>
        <Row label="Hectáreas" value={String(job.hectares)} />
        <Row label="Precio/ha" value={formatCurrency(job.unit_price)} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(job.total)}</Text>
        </View>
      </View>
```
(El texto "Productos aplicados" del card de químicos puede dejarse igual o renombrarse a "Químicos aplicados"; renombrarlo a "Químicos aplicados" para coincidir con la web.)

- [ ] **Step 5: Quitar el bloque de GPS / Maps**

Eliminar por completo el bloque:
```tsx
      {hasGps ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${job.latitude},${job.longitude}`)}
        >
          <Text style={styles.linkText}>Abrir ubicación en Maps ›</Text>
        </TouchableOpacity>
      ) : null}
```

- [ ] **Step 6: Verificar typecheck del detalle**

Run: `npm --prefix C:/Users/victo/Proyectos/VerAgro-ERP/mobile run typecheck 2>&1 | grep "FieldJobDetailScreen" || echo "FieldJobDetailScreen OK"`
Expected: `FieldJobDetailScreen OK` (puede quedar error en FieldJobsScreen, Task 4).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobDetailScreen.tsx
git commit -m "feat(field-jobs mobile): detalle limpio (cultivo, sin tipo/gps/quintales)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: FieldJobsScreen — lista limpia + typecheck verde

**Files:**
- Modify: `mobile/src/features/field-jobs/FieldJobsScreen.tsx`

**Interfaces:**
- Consumes: `FieldJob` sin `quintals`/`job_type`-en-UI.

- [ ] **Step 1: Quitar tipo y quintales de la línea de resumen**

En `mobile/src/features/field-jobs/FieldJobsScreen.tsx`:
- Quitar el import de `JOB_TYPE_LABEL` (del import de `./api`).
- Reemplazar la línea:
```tsx
  const qty = job.job_type === "spreading" ? `${job.quintals} qq` : `${job.hectares} ha`;
```
por:
```tsx
  const qty = `${job.hectares} ha`;
```
- Reemplazar la línea de resumen que usa `JOB_TYPE_LABEL`:
```tsx
        {JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} · {job.location || "Sin finca"} · {qty} ·{" "}
```
por:
```tsx
        {job.location || "Sin finca"} · {qty} ·{" "}
```

- [ ] **Step 2: Verificar typecheck de todo el proyecto móvil (verde total)**

Run: `npm --prefix C:/Users/victo/Proyectos/VerAgro-ERP/mobile run typecheck`
Expected: **0 errores en todo el proyecto móvil**. Si queda alguna referencia a campos eliminados (`quintals`, `latitude`, `longitude`, `applied_product`, `crop` como texto), corregirla con el cambio mínimo.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/field-jobs/FieldJobsScreen.tsx
git commit -m "feat(field-jobs mobile): lista solo-fumigacion (sin tipo ni quintales)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** cultivo selector + otros (Task 2 form, Task 3 detalle), solo-fumigación sin quintales/tipo/GPS (Task 2 form, Task 3 detalle, Task 4 lista), químicos L/ha·cc/ha + tope 10 (Task 1 unidades, Task 2 form), quitar campos eliminados (Tasks 2-4), calculadora intacta (`SprayCalculatorScreen` no se toca; solo verá 2 unidades). Cubierto.
- **Placeholder scan:** sin TBD/TODO; código completo.
- **Type consistency:** `crop` usa valores `rice/corn/pasture/other`; `crop_other` solo se envía cuando `crop==="other"`; `job_type:"fumigation"` fijo; `FieldJobInput` sin quintals/lat/long; `PRODUCT_UNIT_OPTIONS` reducido se usa igual en form y `SprayCalculatorScreen`.
- **Gate:** `npm run typecheck` (sin framework de tests en el móvil).
- **Nota expo-location:** el formulario deja de usar `expo-location`; el paquete puede seguir en `package.json` (lo usa, por ejemplo, otra pantalla o queda como dependencia sin uso) — no se desinstala en este plan.
