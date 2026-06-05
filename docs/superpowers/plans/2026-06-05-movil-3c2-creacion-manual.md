# Móvil 3c-2 — Creación/edición manual de Cotización, Factura y OC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear (y editar borradores de) cotizaciones y facturas, y crear órdenes de compra, con líneas dinámicas, desde la app móvil.

**Architecture:** El backend ya acepta `lines`/`additional_costs` anidadas en POST/PATCH. Se añaden hooks `useCreate*`/`useUpdate*`, dos helpers de UI (`LineCard`, `AddRowButton`) y tres modales de formulario (`QuoteFormModal`, `InvoiceFormModal`, `PurchaseOrderFormModal`), y se cablean FAB en las 3 listas + botón "Editar" en los 2 detalles.

**Tech Stack:** React Native (Expo SDK 56), React 19, TS 5.9, TanStack Query v5, openapi-fetch. **Sin test runner**: gate por tarea = `npm run typecheck` (exit 0); final añade `npx expo export --platform android`. Commits en español, trailer `Co-Authored-By: Claude Opus 4.8`.

**Spec:** `docs/superpowers/specs/2026-06-05-movil-3c2-creacion-manual-design.md`

Todos los comandos desde `mobile/`.

---

### Task 1: Helpers de UI `LineCard` y `AddRowButton`

**Files:**
- Modify: `mobile/src/components/ui/form.tsx`

- [ ] **Step 1: Añadir los dos componentes**

Tras la función `FormModal` (antes del `const styles = StyleSheet.create({`), añadir:

```tsx
// ---------- LineCard (una línea de un documento, con eliminar) ----------
export function LineCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.lineCard}>
      <View style={styles.lineHeader}>
        <Text style={styles.lineTitle}>{title}</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

// ---------- AddRowButton (botón "+ Agregar") ----------
export function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.addRow} onPress={onPress}>
      <Ionicons name="add" size={18} color={colors.primary} />
      <Text style={styles.addRowText}>{label}</Text>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Añadir estilos**

Dentro del `StyleSheet.create({ ... })` de `form.tsx`, añadir estas claves:

```tsx
  lineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineTitle: { fontSize: font.sm, fontWeight: "700", color: colors.dimmed },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  addRowText: { color: colors.primary, fontWeight: "600", fontSize: font.sm },
```

(`form.tsx` ya importa `colors, font, radius, spacing` de `../../theme` y `View, Text, TouchableOpacity, Ionicons, ReactNode`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/form.tsx
git commit -m "feat(movil): helpers LineCard y AddRowButton para lineas dinamicas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Hooks y opciones de facturación

**Files:**
- Modify: `mobile/src/features/billing/api.ts`

- [ ] **Step 1: Añadir opciones, tipos de entrada y hooks**

Al final de `billing/api.ts` añadir:

```ts
// ---------- Opciones ----------
export const LINE_TYPE_OPTIONS = [
  { value: "product", label: "Producto" },
  { value: "service", label: "Servicio" },
  { value: "labor", label: "Mano de obra" },
  { value: "diagnostic", label: "Diagnóstico" },
  { value: "other", label: "Otro" },
];

export const INVOICE_TYPE_OPTIONS = [
  { value: "service_invoice", label: "Servicio" },
  { value: "final_invoice", label: "Final" },
  { value: "product_sale", label: "Venta de producto" },
];

// ---------- Cotización: crear/editar ----------
export interface QuoteLineInput {
  line_type: string;
  description: string;
  quantity: string;
  unit_price: string;
}
export interface QuoteInput {
  customer: number;
  issue_date?: string;
  expiration_date?: string | null;
  discount_percentage: string;
  tax_percentage: string;
  notes: string;
  terms: string;
  lines: QuoteLineInput[];
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteInput) => {
      const { data, error } = await api.POST("/api/quotes/", {
        body: input as unknown as Quote,
      });
      if (error || !data) throw new Error("No se pudo crear la cotización.");
      return data as Quote;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useUpdateQuote(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteInput) => {
      const { data, error } = await api.PATCH("/api/quotes/{id}/", {
        params: { path: { id: id as number } },
        body: input as unknown as Quote,
      });
      if (error || !data) throw new Error("No se pudo guardar la cotización.");
      return data as Quote;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quote", id] });
      void qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

// ---------- Factura: crear/editar ----------
export interface InvoiceLineInput {
  line_type: string;
  product: number | null;
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
}
export interface InvoiceInput {
  customer: number;
  invoice_type: string;
  issue_date?: string;
  due_date?: string | null;
  discount_percentage: string;
  tax_percentage: string;
  notes: string;
  lines: InvoiceLineInput[];
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvoiceInput) => {
      const { data, error } = await api.POST("/api/invoices/", {
        body: input as unknown as Invoice,
      });
      if (error || !data) throw new Error("No se pudo crear la factura.");
      return data as Invoice;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useUpdateInvoice(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvoiceInput) => {
      const { data, error } = await api.PATCH("/api/invoices/{id}/", {
        params: { path: { id: id as number } },
        body: input as unknown as Invoice,
      });
      if (error || !data) throw new Error("No se pudo guardar la factura.");
      return data as Invoice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/billing/api.ts
git commit -m "feat(movil): hooks crear/editar cotizacion y factura + opciones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `QuoteFormModal` + FAB en lista + Editar en detalle

**Files:**
- Create: `mobile/src/features/billing/QuoteFormModal.tsx`
- Modify: `mobile/src/features/billing/QuotesScreen.tsx`
- Modify: `mobile/src/features/billing/QuoteDetailScreen.tsx`

- [ ] **Step 1: Crear `QuoteFormModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AddRowButton, FormModal, LineCard, Picker } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import type { MoreNav } from "../../navigation/types";
import { useCustomers } from "../customers/api";
import {
  LINE_TYPE_OPTIONS,
  useCreateQuote,
  useUpdateQuote,
  type Quote,
  type QuoteLineInput,
} from "./api";

const emptyLine = (): QuoteLineInput => ({
  line_type: "service",
  description: "",
  quantity: "1",
  unit_price: "0",
});

export function QuoteFormModal({
  visible,
  onClose,
  quote,
}: {
  visible: boolean;
  onClose: () => void;
  quote?: Quote | null;
}) {
  const nav = useNavigation<MoreNav>();
  const editing = Boolean(quote?.id);
  const create = useCreateQuote();
  const update = useUpdateQuote(quote?.id);
  const customers = useCustomers("");

  const [customer, setCustomer] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<QuoteLineInput[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (quote) {
      setCustomer(quote.customer ?? null);
      setIssueDate(quote.issue_date ?? "");
      setExpirationDate(quote.expiration_date ?? "");
      setDiscount(String(quote.discount_percentage ?? "0"));
      setTax(String(quote.tax_percentage ?? "0"));
      setNotes(quote.notes ?? "");
      setTerms(quote.terms ?? "");
      setLines(
        (quote.lines ?? []).map((l) => ({
          line_type: l.line_type ?? "service",
          description: l.description ?? "",
          quantity: String(l.quantity ?? "0"),
          unit_price: String(l.unit_price ?? "0"),
        })),
      );
    } else {
      setCustomer(null);
      setIssueDate("");
      setExpirationDate("");
      setDiscount("0");
      setTax("0");
      setNotes("");
      setTerms("");
      setLines([emptyLine()]);
    }
  }, [visible, quote]);

  const updateLine = (i: number, patch: Partial<QuoteLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    if (lines.length === 0) return Alert.alert("Sin líneas", "Agrega al menos una línea.");
    const input = {
      customer,
      issue_date: issueDate || undefined,
      expiration_date: expirationDate || null,
      discount_percentage: discount || "0",
      tax_percentage: tax || "0",
      notes,
      terms,
      lines,
    };
    const onError = (e: unknown) => Alert.alert("Error", (e as Error).message);
    if (editing) {
      update.mutate(input, { onSuccess: onClose, onError });
    } else {
      create.mutate(input, {
        onSuccess: (q) => {
          onClose();
          nav.navigate("QuoteDetail", { id: q.id, title: q.quote_number ?? "Cotización" });
        },
        onError,
      });
    }
  };

  const customerOptions = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={editing ? "Editar cotización" : "Nueva cotización"}
      onSubmit={submit}
      submitting={create.isPending || update.isPending}
      submitLabel={editing ? "Guardar" : "Crear"}
    >
      <Picker
        label="Cliente"
        value={customer}
        onChange={(v) => setCustomer(v as number | null)}
        options={customerOptions}
      />
      <LabeledInput
        label="Emisión (YYYY-MM-DD)"
        value={issueDate}
        onChangeText={setIssueDate}
        placeholder="2026-06-05"
        autoCapitalize="none"
      />
      <LabeledInput
        label="Vence (YYYY-MM-DD)"
        value={expirationDate}
        onChangeText={setExpirationDate}
        placeholder="opcional"
        autoCapitalize="none"
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Descuento %" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Impuesto %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" />
        </View>
      </View>

      <SectionTitle>Conceptos</SectionTitle>
      {lines.map((l, i) => (
        <LineCard key={i} title={`Línea ${i + 1}`} onRemove={() => removeLine(i)}>
          <Picker
            label="Tipo"
            value={l.line_type}
            onChange={(v) => updateLine(i, { line_type: String(v) })}
            options={LINE_TYPE_OPTIONS}
          />
          <LabeledInput
            label="Descripción"
            value={l.description}
            onChangeText={(t) => updateLine(i, { description: t })}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Cantidad" value={l.quantity} onChangeText={(t) => updateLine(i, { quantity: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Precio" value={l.unit_price} onChangeText={(t) => updateLine(i, { unit_price: t })} keyboardType="decimal-pad" />
            </View>
          </View>
        </LineCard>
      ))}
      <AddRowButton label="Agregar línea" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
      <LabeledInput label="Términos" value={terms} onChangeText={setTerms} multiline />
    </FormModal>
  );
}
```

- [ ] **Step 2: FAB en `QuotesScreen.tsx`**

- En el import de `../../components/ui`, añadir `FAB`: `import { Badge, Card, FAB, SearchBar } from "../../components/ui";`
- Importar el modal: `import { QuoteFormModal } from "./QuoteFormModal";`
- Tras `const q = useQuotes(search);` añadir `const [formOpen, setFormOpen] = useState(false);`
- Antes del cierre `</Screen>`, tras el `<ListView .../>`, añadir:

```tsx
      <FAB onPress={() => setFormOpen(true)} />
      <QuoteFormModal visible={formOpen} onClose={() => setFormOpen(false)} quote={null} />
```

- [ ] **Step 3: Botón "Editar" en `QuoteDetailScreen.tsx`**

- Añadir `import { useState } from "react";` al inicio.
- Importar el modal: `import { QuoteFormModal } from "./QuoteFormModal";`
- Tras `const convert = useConvertQuote(params.id);` añadir `const [editOpen, setEditOpen] = useState(false);`
- Tras `const canConvert = st === "approved";` añadir `const canEdit = st === "draft" || st === "sent";`
- Cambiar la condición de la Card de acciones para incluir `canEdit`:
  `{(canApprove || canReject || canConvert || canEdit) && (`
- Dentro de esa Card, tras el botón "Aprobar", añadir:

```tsx
          {canEdit && <Button title="Editar" icon="create" variant="subtle" onPress={() => setEditOpen(true)} />}
```

- Antes del cierre `</Screen>` final, añadir:

```tsx
      <QuoteFormModal visible={editOpen} onClose={() => setEditOpen(false)} quote={q} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/billing/QuoteFormModal.tsx src/features/billing/QuotesScreen.tsx src/features/billing/QuoteDetailScreen.tsx
git commit -m "feat(movil): crear/editar cotizacion con lineas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `InvoiceFormModal` + FAB en lista + Editar en detalle

**Files:**
- Create: `mobile/src/features/billing/InvoiceFormModal.tsx`
- Modify: `mobile/src/features/billing/InvoicesScreen.tsx`
- Modify: `mobile/src/features/billing/InvoiceDetailScreen.tsx`

- [ ] **Step 1: Crear `InvoiceFormModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AddRowButton, FormModal, LineCard, Picker } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import type { MoreNav } from "../../navigation/types";
import { useCustomers } from "../customers/api";
import { useProductSearch } from "../inventory/api";
import {
  INVOICE_TYPE_OPTIONS,
  LINE_TYPE_OPTIONS,
  useCreateInvoice,
  useUpdateInvoice,
  type Invoice,
  type InvoiceLineInput,
} from "./api";

const emptyLine = (): InvoiceLineInput => ({
  line_type: "product",
  product: null,
  description: "",
  quantity: "1",
  unit_price: "0",
  unit_cost: "0",
});

export function InvoiceFormModal({
  visible,
  onClose,
  invoice,
}: {
  visible: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
}) {
  const nav = useNavigation<MoreNav>();
  const editing = Boolean(invoice?.id);
  const create = useCreateInvoice();
  const update = useUpdateInvoice(invoice?.id);
  const customers = useCustomers("");
  const products = useProductSearch("");

  const [customer, setCustomer] = useState<number | null>(null);
  const [invoiceType, setInvoiceType] = useState("product_sale");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLineInput[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (invoice) {
      setCustomer(invoice.customer ?? null);
      setInvoiceType(invoice.invoice_type ?? "product_sale");
      setIssueDate(invoice.issue_date ?? "");
      setDueDate(invoice.due_date ?? "");
      setDiscount(String(invoice.discount_percentage ?? "0"));
      setTax(String(invoice.tax_percentage ?? "0"));
      setNotes(invoice.notes ?? "");
      setLines(
        (invoice.lines ?? []).map((l) => ({
          line_type: l.line_type ?? "product",
          product: l.product ?? null,
          description: l.description ?? "",
          quantity: String(l.quantity ?? "0"),
          unit_price: String(l.unit_price ?? "0"),
          unit_cost: String(l.unit_cost ?? "0"),
        })),
      );
    } else {
      setCustomer(null);
      setInvoiceType("product_sale");
      setIssueDate("");
      setDueDate("");
      setDiscount("0");
      setTax("0");
      setNotes("");
      setLines([emptyLine()]);
    }
  }, [visible, invoice]);

  const updateLine = (i: number, patch: Partial<InvoiceLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const onPickProduct = (i: number, value: number | null) => {
    const p = (products.data ?? []).find((x) => x.id === value);
    updateLine(i, {
      product: value,
      ...(p
        ? {
            line_type: "product",
            description: p.name ?? "",
            unit_price: String(p.sale_price ?? "0"),
            unit_cost: String(p.average_cost ?? "0"),
          }
        : {}),
    });
  };

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    if (lines.length === 0) return Alert.alert("Sin líneas", "Agrega al menos una línea.");
    const input = {
      customer,
      invoice_type: invoiceType,
      issue_date: issueDate || undefined,
      due_date: dueDate || null,
      discount_percentage: discount || "0",
      tax_percentage: tax || "0",
      notes,
      lines,
    };
    const onError = (e: unknown) => Alert.alert("Error", (e as Error).message);
    if (editing) {
      update.mutate(input, { onSuccess: onClose, onError });
    } else {
      create.mutate(input, {
        onSuccess: (inv) => {
          onClose();
          nav.navigate("InvoiceDetail", { id: inv.id, title: inv.invoice_number ?? "Factura" });
        },
        onError,
      });
    }
  };

  const customerOptions = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const productOptions = (products.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.sku} · ${p.name}`,
  }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={editing ? "Editar factura" : "Nueva factura"}
      onSubmit={submit}
      submitting={create.isPending || update.isPending}
      submitLabel={editing ? "Guardar" : "Crear"}
    >
      <Picker
        label="Cliente"
        value={customer}
        onChange={(v) => setCustomer(v as number | null)}
        options={customerOptions}
      />
      <Picker
        label="Tipo de factura"
        value={invoiceType}
        onChange={(v) => setInvoiceType(String(v))}
        options={INVOICE_TYPE_OPTIONS}
      />
      <LabeledInput label="Emisión (YYYY-MM-DD)" value={issueDate} onChangeText={setIssueDate} placeholder="2026-06-05" autoCapitalize="none" />
      <LabeledInput label="Vence (YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="opcional" autoCapitalize="none" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Descuento %" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Impuesto %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" />
        </View>
      </View>

      <SectionTitle>Conceptos</SectionTitle>
      {lines.map((l, i) => (
        <LineCard key={i} title={`Línea ${i + 1}`} onRemove={() => removeLine(i)}>
          <Picker
            label="Producto (opcional)"
            value={l.product}
            onChange={(v) => onPickProduct(i, v as number | null)}
            options={productOptions}
            clearable
            placeholder="Sin producto"
          />
          <Picker
            label="Tipo"
            value={l.line_type}
            onChange={(v) => updateLine(i, { line_type: String(v) })}
            options={LINE_TYPE_OPTIONS}
          />
          <LabeledInput
            label="Descripción"
            value={l.description}
            onChangeText={(t) => updateLine(i, { description: t })}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Cantidad" value={l.quantity} onChangeText={(t) => updateLine(i, { quantity: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Precio" value={l.unit_price} onChangeText={(t) => updateLine(i, { unit_price: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Costo" value={l.unit_cost} onChangeText={(t) => updateLine(i, { unit_cost: t })} keyboardType="decimal-pad" />
            </View>
          </View>
        </LineCard>
      ))}
      <AddRowButton label="Agregar línea" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
```

- [ ] **Step 2: FAB en `InvoicesScreen.tsx`**

- En el import de `../../components/ui`, añadir `FAB`: `import { Badge, Card, FAB, SearchBar } from "../../components/ui";`
- Importar el modal: `import { InvoiceFormModal } from "./InvoiceFormModal";`
- Tras `const q = useInvoices(search);` añadir `const [formOpen, setFormOpen] = useState(false);`
- Tras el `<ListView .../>` (antes de `</Screen>`), añadir:

```tsx
      <FAB onPress={() => setFormOpen(true)} />
      <InvoiceFormModal visible={formOpen} onClose={() => setFormOpen(false)} invoice={null} />
```

- [ ] **Step 3: Botón "Editar" en `InvoiceDetailScreen.tsx`**

- Importar el modal: `import { InvoiceFormModal } from "./InvoiceFormModal";`
- Tras `const [payOpen, setPayOpen] = useState(false);` añadir `const [editOpen, setEditOpen] = useState(false);`
- Tras `const canIssue = st === "draft";` añadir `const canEdit = st === "draft";`
- En la Card de acciones, tras el botón "Emitir", añadir:

```tsx
        {canEdit && <Button title="Editar" icon="create" variant="subtle" onPress={() => setEditOpen(true)} />}
```

- Antes del `<PaymentModal ... />` final, añadir:

```tsx
      <InvoiceFormModal visible={editOpen} onClose={() => setEditOpen(false)} invoice={inv} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/billing/InvoiceFormModal.tsx src/features/billing/InvoicesScreen.tsx src/features/billing/InvoiceDetailScreen.tsx
git commit -m "feat(movil): crear/editar factura con lineas (producto autollena)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: OC — hook `useCreatePurchaseOrder` + `PurchaseOrderFormModal` + FAB

**Files:**
- Modify: `mobile/src/features/purchasing/api.ts`
- Create: `mobile/src/features/purchasing/PurchaseOrderFormModal.tsx`
- Modify: `mobile/src/features/purchasing/PurchasingScreen.tsx`

- [ ] **Step 1: Hook en `purchasing/api.ts`**

Al final del archivo añadir:

```ts
export interface POLineInput {
  product: number | null;
  quantity_ordered: string;
  unit_purchase_cost: string;
  margin_percentage: string;
}
export interface POCostInput {
  name: string;
  amount: string;
}
export interface PurchaseOrderInput {
  supplier: number;
  order_date?: string;
  expected_date?: string | null;
  currency: string;
  shipping_cost: string;
  notes: string;
  lines: POLineInput[];
  additional_costs: POCostInput[];
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseOrderInput) => {
      const { data, error } = await api.POST("/api/purchase-orders/", {
        body: input as unknown as PurchaseOrder,
      });
      if (error || !data) throw new Error("No se pudo crear la orden de compra.");
      return data as PurchaseOrder;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}
```

- [ ] **Step 2: Crear `PurchaseOrderFormModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AddRowButton, FormModal, LineCard, Picker } from "../../components/ui/form";
import { LabeledInput, SectionTitle } from "../../components/ui";
import type { MoreNav } from "../../navigation/types";
import { useSuppliers } from "../suppliers/api";
import { useProductSearch } from "../inventory/api";
import {
  useCreatePurchaseOrder,
  type POCostInput,
  type POLineInput,
} from "./api";

const emptyLine = (): POLineInput => ({
  product: null,
  quantity_ordered: "1",
  unit_purchase_cost: "0",
  margin_percentage: "0",
});

export function PurchaseOrderFormModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const nav = useNavigation<MoreNav>();
  const create = useCreatePurchaseOrder();
  const suppliers = useSuppliers("");
  const products = useProductSearch("");

  const [supplier, setSupplier] = useState<number | null>(null);
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [shipping, setShipping] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLineInput[]>([]);
  const [costs, setCosts] = useState<POCostInput[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSupplier(null);
    setOrderDate("");
    setExpectedDate("");
    setCurrency("USD");
    setShipping("0");
    setNotes("");
    setLines([emptyLine()]);
    setCosts([]);
  }, [visible]);

  const updateLine = (i: number, patch: Partial<POLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateCost = (i: number, patch: Partial<POCostInput>) =>
    setCosts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCost = (i: number) => setCosts((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!supplier) return Alert.alert("Falta el proveedor", "Selecciona un proveedor.");
    if (lines.length === 0) return Alert.alert("Sin líneas", "Agrega al menos una línea.");
    if (lines.some((l) => l.product == null))
      return Alert.alert("Producto requerido", "Cada línea necesita un producto.");
    const input = {
      supplier,
      order_date: orderDate || undefined,
      expected_date: expectedDate || null,
      currency: currency || "USD",
      shipping_cost: shipping || "0",
      notes,
      lines,
      additional_costs: costs.filter((c) => c.name.trim()),
    };
    create.mutate(input, {
      onSuccess: (o) => {
        onClose();
        nav.navigate("PurchaseOrderDetail", { id: o.id, title: o.order_number ?? "Orden" });
      },
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  const supplierOptions = (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const productOptions = (products.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.sku} · ${p.name}`,
  }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Nueva orden de compra"
      onSubmit={submit}
      submitting={create.isPending}
      submitLabel="Crear"
    >
      <Picker
        label="Proveedor"
        value={supplier}
        onChange={(v) => setSupplier(v as number | null)}
        options={supplierOptions}
      />
      <LabeledInput label="Fecha (YYYY-MM-DD)" value={orderDate} onChangeText={setOrderDate} placeholder="2026-06-05" autoCapitalize="none" />
      <LabeledInput label="Fecha esperada (YYYY-MM-DD)" value={expectedDate} onChangeText={setExpectedDate} placeholder="opcional" autoCapitalize="none" />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Moneda" value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label="Envío" value={shipping} onChangeText={setShipping} keyboardType="decimal-pad" />
        </View>
      </View>

      <SectionTitle>Líneas</SectionTitle>
      {lines.map((l, i) => (
        <LineCard key={i} title={`Línea ${i + 1}`} onRemove={() => removeLine(i)}>
          <Picker
            label="Producto"
            value={l.product}
            onChange={(v) => updateLine(i, { product: v as number | null })}
            options={productOptions}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Cantidad" value={l.quantity_ordered} onChangeText={(t) => updateLine(i, { quantity_ordered: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Costo unit." value={l.unit_purchase_cost} onChangeText={(t) => updateLine(i, { unit_purchase_cost: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Margen %" value={l.margin_percentage} onChangeText={(t) => updateLine(i, { margin_percentage: t })} keyboardType="decimal-pad" />
            </View>
          </View>
        </LineCard>
      ))}
      <AddRowButton label="Agregar línea" onPress={() => setLines((prev) => [...prev, emptyLine()])} />

      <SectionTitle>Costos adicionales</SectionTitle>
      {costs.map((c, i) => (
        <LineCard key={i} title={`Costo ${i + 1}`} onRemove={() => removeCost(i)}>
          <LabeledInput label="Concepto" value={c.name} onChangeText={(t) => updateCost(i, { name: t })} placeholder="Envío, aduana…" />
          <LabeledInput label="Monto" value={c.amount} onChangeText={(t) => updateCost(i, { amount: t })} keyboardType="decimal-pad" />
        </LineCard>
      ))}
      <AddRowButton label="Agregar costo" onPress={() => setCosts((prev) => [...prev, { name: "", amount: "0" }])} />

      <LabeledInput label="Notas" value={notes} onChangeText={setNotes} multiline />
    </FormModal>
  );
}
```

- [ ] **Step 3: FAB en `PurchasingScreen.tsx`**

- En el import de `../../components/ui`, añadir `FAB`: `import { Badge, Card, FAB, SearchBar } from "../../components/ui";`
- Importar el modal: `import { PurchaseOrderFormModal } from "./PurchaseOrderFormModal";`
- Tras `const q = usePurchaseOrders(search);` añadir `const [formOpen, setFormOpen] = useState(false);`
- Tras el `<ListView .../>` (antes de `</Screen>`), añadir:

```tsx
      <FAB onPress={() => setFormOpen(true)} />
      <PurchaseOrderFormModal visible={formOpen} onClose={() => setFormOpen(false)} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/purchasing/api.ts src/features/purchasing/PurchaseOrderFormModal.tsx src/features/purchasing/PurchasingScreen.tsx
git commit -m "feat(movil): crear orden de compra con lineas y costos adicionales

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Verificación final del bundle

**Files:** ninguno.

- [ ] **Step 1: Typecheck global**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Export del bundle**

Run: `npx expo export --platform android`
Expected: termina con "Exported: dist" sin error.

- [ ] **Step 3:** Sin commit. Listo para prueba del usuario (`r`): crear COT/FAC/OC con líneas; editar una COT (draft/sent) y una FAC (draft).

---

## Notas de implementación
- Sin cambios de backend.
- `useCustomers("")`, `useSuppliers("")`, `useProductSearch("")` devuelven arrays (no paginado en el hook móvil) → alimentan los Picker directamente.
- El `Picker` infiere su tipo `T` de `value`/`options`: para producto/cliente/proveedor es `number`; para tipo de línea/factura es `string`.
- `MoreNav` ya incluye `QuoteDetail`, `InvoiceDetail`, `PurchaseOrderDetail` (las listas ya navegan allí).
- Las fechas se capturan como texto `YYYY-MM-DD` (no hay date-picker nativo en el kit; consistente con la web que usa `<input type=date>`); cadena vacía → se omite/`null`.
