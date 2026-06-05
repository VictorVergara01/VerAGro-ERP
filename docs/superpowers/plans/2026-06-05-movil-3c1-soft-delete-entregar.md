# Móvil 3c-1 — Soft-delete (long-press) + "Entregar sin cobro" (admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir eliminar (soft-delete) clientes, proveedores, productos y equipos con long-press en sus listas, y exponer el override admin "Entregar sin cobro" en órdenes finalizadas — todo en el frontend móvil.

**Architecture:** El backend ya soporta ambas cosas (DELETE → soft-delete 204; deliver con override admin desde `finished`). Se añade un hook `useDelete*` por feature, se da al `Card` compartido un `onLongPress`, y cada pantalla de lista cablea un `Alert` de confirmación. En `OrderDetailScreen` se añade un botón condicionado a `admin + finished`.

**Tech Stack:** React Native (Expo SDK 56), React 19, TypeScript 5.9, TanStack Query v5, openapi-fetch. **No hay test runner en el móvil**: el gate de cada tarea es `npm run typecheck` (exit 0), y el final añade `npx expo export`. Commits en español, trailer `Co-Authored-By: Claude Opus 4.8`.

**Spec:** `docs/superpowers/specs/2026-06-05-movil-3c1-soft-delete-entregar-design.md`

Todos los comandos se ejecutan desde `mobile/`.

---

### Task 1: `Card` admite `onLongPress`

**Files:**
- Modify: `mobile/src/components/ui/index.tsx` (componente `Card`, líneas ~17-34)

- [ ] **Step 1: Añadir la prop y pasarla al touchable**

Reemplazar la función `Card` por:

```tsx
export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  if (onPress || onLongPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/index.tsx
git commit -m "feat(movil): Card admite onLongPress

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Eliminar cliente (hook + long-press)

**Files:**
- Modify: `mobile/src/features/customers/api.ts`
- Modify: `mobile/src/features/customers/CustomersScreen.tsx`

- [ ] **Step 1: Hook `useDeleteCustomer`**

Añadir al final de `customers/api.ts` (antes de `CUSTOMER_TYPE_LABEL`):

```ts
export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/customers/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el cliente.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
```

- [ ] **Step 2: Cablear long-press en `CustomersScreen.tsx`**

Importar `Alert` desde `react-native` (añadir a la línea de import de RN: `import { Alert, StyleSheet, Text, View } from "react-native";`).

Importar el hook: cambiar el import de `./api` a incluir `useDeleteCustomer`:
`import { CUSTOMER_TYPE_LABEL, useCustomers, useDeleteCustomer, type Customer } from "./api";`

Dentro del componente, tras `const q = useCustomers(search);` añadir:

```tsx
  const del = useDeleteCustomer();

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
```

En el `<Card>` del `renderItem`, añadir la prop:
`<Card onPress={() => nav.navigate("CustomerDetail", { id: c.id, title: c.name })} onLongPress={() => confirmDelete(c)}>`

En el `header`, debajo del `SearchBar`, añadir el hint (dentro del `<View style={{ marginBottom: 12 }}>`, tras `</SearchBar>`/cierre del SearchBar):

```tsx
            <Text style={styles.hint}>Mantén pulsada una fila para eliminar.</Text>
```

Y en el `StyleSheet.create`, añadir:
```tsx
  hint: { fontSize: font.xs, color: colors.dimmed, marginTop: 6, fontStyle: "italic" },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/customers/api.ts mobile/src/features/customers/CustomersScreen.tsx
git commit -m "feat(movil): eliminar cliente con long-press

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Eliminar proveedor (hook + long-press)

**Files:**
- Modify: `mobile/src/features/suppliers/api.ts`
- Modify: `mobile/src/features/suppliers/SuppliersScreen.tsx`

- [ ] **Step 1: Hook `useDeleteSupplier`**

Añadir al final de `suppliers/api.ts`:

```ts
export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/suppliers/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el proveedor.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
```

- [ ] **Step 2: Cablear long-press en `SuppliersScreen.tsx`**

Primero leer el archivo para ver su estructura exacta (campo de nombre, imports). Aplicar el mismo patrón que `CustomersScreen`:
- Importar `Alert` de `react-native` y `useDeleteSupplier` de `./api`.
- Instanciar `const del = useDeleteSupplier();`.
- Añadir `confirmDelete(s)` con `Alert` ("Eliminar proveedor", `¿Eliminar "${s.name}"? Se desactivará y dejará de aparecer en la lista.`) que llama `del.mutate(s.id, { onError })`.
- Pasar `onLongPress={() => confirmDelete(s)}` al `Card` de la lista.
- Añadir el hint "Mantén pulsada una fila para eliminar." bajo el `SearchBar` y el estilo `hint` (si el screen no importa `font`/`colors`, añadirlos al import de `../../theme`).

```tsx
  const del = useDeleteSupplier();

  const confirmDelete = (s: Supplier) =>
    Alert.alert(
      "Eliminar proveedor",
      `¿Eliminar "${s.name}"? Se desactivará y dejará de aparecer en la lista.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(s.id, {
              onError: (e) => Alert.alert("Error", (e as Error).message),
            }),
        },
      ],
    );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/suppliers/api.ts mobile/src/features/suppliers/SuppliersScreen.tsx
git commit -m "feat(movil): eliminar proveedor con long-press

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Eliminar equipo (hook + long-press)

**Files:**
- Modify: `mobile/src/features/equipment/api.ts`
- Modify: `mobile/src/features/equipment/EquipmentScreen.tsx`

- [ ] **Step 1: Hook `useDeleteEquipment`**

Añadir a `equipment/api.ts` (el archivo ya importa `useMutation`/`useQueryClient`):

```ts
export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/equipment/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el equipo.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["equipment"] }),
  });
}
```

(El backend hace `status=retired`; al invalidar `["equipment"]` la lista se refresca. Si la lista muestra equipos `retired`, el badge ya lo refleja — no se fuerza nada extra.)

- [ ] **Step 2: Cablear long-press en `EquipmentScreen.tsx`**

Leer el archivo primero. Aplicar el patrón:
- Importar `Alert` de `react-native` y `useDeleteEquipment` de `./api`.
- `const del = useDeleteEquipment();`
- `confirmDelete(eq)` → `Alert` ("Eliminar equipo", `¿Eliminar "${eq.name}"? Se marcará como retirado.`) → `del.mutate(eq.id, { onError })`.
- `onLongPress={() => confirmDelete(eq)}` en el `Card`.
- Hint + estilo `hint` como en las tareas anteriores.

```tsx
  const del = useDeleteEquipment();

  const confirmDelete = (eq: Equipment) =>
    Alert.alert(
      "Eliminar equipo",
      `¿Eliminar "${eq.name}"? Se marcará como retirado.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(eq.id, {
              onError: (e) => Alert.alert("Error", (e as Error).message),
            }),
        },
      ],
    );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/equipment/api.ts mobile/src/features/equipment/EquipmentScreen.tsx
git commit -m "feat(movil): eliminar equipo con long-press

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Eliminar producto (hook + long-press)

**Files:**
- Modify: `mobile/src/features/inventory/api.ts`
- Modify: `mobile/src/features/inventory/InventorySearchScreen.tsx`

- [ ] **Step 1: Hook `useDeleteProduct`**

Añadir a `inventory/api.ts`:

```ts
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/inventory/products/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el producto.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["product-search"] }),
  });
}
```

- [ ] **Step 2: Cablear long-press en `InventorySearchScreen.tsx`**

Leer el archivo primero (ya importa `Card`, `FAB`, `SearchBar` y `ProductFormModal`; usa `useProductSearch`). Aplicar el patrón:
- Importar `Alert` de `react-native` y `useDeleteProduct` de `./api`.
- `const del = useDeleteProduct();`
- `confirmDelete(p)` → `Alert` ("Eliminar producto", `¿Eliminar "${p.name}"? Se desactivará y dejará de aparecer.`) → `del.mutate(p.id, { onError })`.
- `onLongPress={() => confirmDelete(p)}` en el `Card` de cada producto (junto a su `onPress` actual, sea editar o ver detalle).
- Hint + estilo `hint` como antes.

```tsx
  const del = useDeleteProduct();

  const confirmDelete = (p: Product) =>
    Alert.alert(
      "Eliminar producto",
      `¿Eliminar "${p.name}"? Se desactivará y dejará de aparecer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            del.mutate(p.id, {
              onError: (e) => Alert.alert("Error", (e as Error).message),
            }),
        },
      ],
    );
```

(`Product` ya se exporta desde `inventory/api.ts`; importarlo si el screen aún no lo tiene.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/inventory/api.ts mobile/src/features/inventory/InventorySearchScreen.tsx
git commit -m "feat(movil): eliminar producto con long-press

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: "Entregar sin cobro" (override admin) en `OrderDetailScreen`

**Files:**
- Modify: `mobile/src/features/orders/OrderDetailScreen.tsx`

- [ ] **Step 1: Leer el rol y añadir el handler**

Importar el hook de auth (añadir al bloque de imports):
`import { useAuth } from "../auth/useAuth";`

Dentro del componente, tras `const cancelOrder = useCancelOrder(id);` añadir:

```tsx
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
```

Tras `runAction` (o junto a los otros handlers), añadir:

```tsx
  const deliverWithoutCharge = () =>
    Alert.alert(
      "Entregar sin cobro",
      "La orden se marcará como entregada sin factura pagada. ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Entregar",
          style: "destructive",
          onPress: () =>
            action.mutate("deliver", {
              onError: (e) => Alert.alert("Error", (e as Error).message),
            }),
        },
      ],
    );
```

- [ ] **Step 2: Renderizar el botón y ajustar el aviso de espera**

Localizar el bloque final que muestra el aviso de `finished` (líneas ~314-320):

```tsx
      ) : (
        <Text style={styles.dimmedCenter}>
          {status === "finished"
            ? "Esperando facturación y pago para poder entregar."
            : "No hay acciones disponibles en este estado."}
        </Text>
      )}
```

Reemplazarlo por (el admin ve el botón de override en lugar del aviso de espera):

```tsx
      ) : status === "finished" && isAdmin ? (
        <TouchableOpacity
          style={styles.docBtn}
          onPress={deliverWithoutCharge}
          disabled={action.isPending}
        >
          <Text style={styles.docText}>Entregar sin cobro</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.dimmedCenter}>
          {status === "finished"
            ? "Esperando facturación y pago para poder entregar."
            : "No hay acciones disponibles en este estado."}
        </Text>
      )}
```

(`action`, `styles.docBtn`, `styles.docText` y `styles.dimmedCenter` ya existen en el archivo. `next` es `null` en `finished`, así que la rama `next ? (...)` no se cumple y entra a esta cadena.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/orders/OrderDetailScreen.tsx
git commit -m "feat(movil): boton admin 'entregar sin cobro' en orden finalizada

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final del bundle

**Files:** ninguno (solo build).

- [ ] **Step 1: Typecheck global**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Export del bundle**

Run: `npx expo export --platform android`
Expected: termina sin error ("Exported bundle" / carpeta `dist` generada).

- [ ] **Step 3: (No requiere commit)** Si los pasos anteriores pasan, el slice 3c-1 está listo para prueba del usuario en dispositivo (`r` en Metro): long-press elimina en las 4 listas; con sesión admin, una orden `finished` muestra "Entregar sin cobro" y la entrega.

---

## Notas de implementación
- No hay cambios de backend en este slice.
- Las 4 listas usan `Card` con `onPress` (navegan al detalle); `onLongPress` es aditivo y no rompe la navegación.
- Si alguna pantalla de lista no importa `colors`/`font` desde `../../theme`, añadirlos al hacer el estilo `hint`.
- Tras eliminar, la fila desaparece por la invalidación de la query de lista (el backend filtra inactivos por defecto en clientes/proveedores/productos; equipo pasa a `retired`).
