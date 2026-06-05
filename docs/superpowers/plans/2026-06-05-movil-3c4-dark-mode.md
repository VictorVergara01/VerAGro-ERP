# Móvil 3c-4 — Dark mode (toggle manual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tema claro/oscuro con toggle manual en "Más", persistido con expo-secure-store, aplicado a toda la app móvil.

**Architecture:** `theme.ts` → `theme.tsx` con paletas claro/oscuro (solo cambian 6 colores estructurales), `ThemeProvider`/`useTheme`/`useThemedStyles`. Cada componente lee `colors` del contexto (sombreando el nombre) y convierte su `StyleSheet.create` en una fábrica `makeStyles(colors)`. `colors` estático se mantiene para usos a nivel de módulo (back-compat), así la conversión es incremental y el typecheck pasa en cada paso.

**Tech Stack:** Expo SDK 56, RN 0.85, TS 5.9, expo-secure-store, @react-navigation/native v7. Gate por tarea = `npm run typecheck` (exit 0); final añade `npx expo export`. Commits en español, trailer `Co-Authored-By: Claude Opus 4.8`.

**Spec:** `docs/superpowers/specs/2026-06-05-movil-3c4-dark-mode-design.md`. Comandos desde `mobile/`.

## Patrón de conversión (aplica a Tasks 2-6)
Para cada archivo con estilos/colores estructurales:
1. Import: quitar `colors` del import de `../../theme` (mantener `spacing/radius/font/softBg/...`);
   añadir lo que use: `useTheme`, `useThemedStyles`, `type ThemeColors`.
2. En cada **componente función** del archivo:
   - si hay usos **inline** de `colors.x`: `const { colors } = useTheme();`
   - si hay `StyleSheet`: `const styles = useThemedStyles(makeStyles);`
3. Renombrar el `const styles = StyleSheet.create({` (módulo) → `const makeStyles = (colors: ThemeColors) => StyleSheet.create({`. **El cuerpo no cambia.**
4. Defaults de parámetro que usen `colors.x` (p.ej. `color = colors.dimmed`) → moverlos dentro del
   componente (`const c = color ?? colors.dimmed`).

Tras cada Task: `npm run typecheck` (exit 0) y commit.

---

### Task 1: Infraestructura de tema + App.tsx

**Files:**
- Rename: `mobile/src/theme.ts` → `mobile/src/theme.tsx` (con `git mv`)
- Modify: el nuevo `mobile/src/theme.tsx`
- Modify: `mobile/App.tsx`

- [ ] **Step 1: Renombrar a `.tsx`**

Run: `git mv src/theme.ts src/theme.tsx`
(Los imports `from "../../theme"` siguen resolviendo a `theme.tsx`.)

- [ ] **Step 2: Reescribir `theme.tsx`**

Sustituir el bloque inicial de `theme.tsx` (desde `export const colors = {` hasta el final de
`softBg`) por:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";

const accent = {
  primary: "#2f9e44",
  primaryDark: "#1d7531",
  primarySoft: "#e7f8ee",
  danger: "#e03131",
  warning: "#f08c00",
  info: "#1971c2",
  grape: "#9c36b5",
  teal: "#0ca678",
};

export const lightColors = {
  ...accent,
  bg: "#f1f3f5",
  card: "#ffffff",
  text: "#1a1b1e",
  dimmed: "#868e96",
  border: "#e9ecef",
  headerBg: "#f8f9fa",
};

export const darkColors = {
  ...accent,
  bg: "#121417",
  card: "#1e2126",
  text: "#e9ecef",
  dimmed: "#909296",
  border: "#2c2e33",
  headerBg: "#1a1c20",
};

export type ThemeColors = typeof lightColors;

/** Back-compat: usos a nivel de módulo (mapas de estado, equipment/api.ts). */
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const font = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
};

/** Convierte un color de marca/hex a un fondo claro (badge "light"). */
export function softBg(hex: string): string {
  return hex + "22"; // ~13% alpha sobre el color
}
```

(Mantener intactos, debajo, los mapas `statusColors`, `statusLabels`, `invoiceStatusColors`,
`invoiceStatusLabels`, `quoteStatusColors`, `quoteStatusLabels`, `poStatusColors`, `poStatusLabels`,
`serviceTypeLabels`.)

- [ ] **Step 3: Añadir el contexto al final de `theme.tsx`**

```tsx
// ---------- Tema (claro/oscuro) ----------
export type Scheme = "light" | "dark";
const THEME_KEY = "veragro.theme";

interface ThemeValue {
  colors: ThemeColors;
  scheme: Scheme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>("light");

  useEffect(() => {
    void (async () => {
      const saved = await SecureStore.getItemAsync(THEME_KEY);
      if (saved === "dark" || saved === "light") setScheme(saved);
    })();
  }, []);

  const toggle = useCallback(() => {
    setScheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      void SecureStore.setItemAsync(THEME_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ colors: scheme === "dark" ? darkColors : lightColors, scheme, toggle }),
    [scheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>.");
  return ctx;
}

export function useThemedStyles<T>(factory: (c: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
```

- [ ] **Step 4: Envolver la app en `App.tsx`**

Reemplazar el contenido de `App.tsx` por:

```tsx
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/features/auth/AuthContext";
import { queryClient } from "./src/lib/api/queryClient";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme";

function ThemedApp() {
  const { colors, scheme } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → exit 0.
```bash
git add src/theme.tsx App.tsx
git commit -m "feat(movil): infraestructura de tema claro/oscuro (provider + hooks)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: UI kit

**Files:** `components/ui/index.tsx`, `components/ui/form.tsx`, `components/ui/Screen.tsx`, `components/ui/ListView.tsx`

- [ ] **Step 1: Convertir los 4 archivos con el patrón**

Aplicar el patrón de conversión a cada uno. Notas por archivo:
- `index.tsx`: tiene ~12 componentes que usan `styles` → en cada uno `const styles = useThemedStyles(makeStyles);`. Los que usan `colors.x` inline (Button, SearchBar, LabeledInput, FAB, Loading, etc.) → `const { colors } = useTheme();`. **`Badge`**: su default `color = colors.dimmed` (param) → cambiar a `color?: string` y dentro `const { colors } = useTheme(); const c = color ?? colors.dimmed;` (usar `c` donde iba `color`). Renombrar el `StyleSheet.create` a `makeStyles`.
- `form.tsx`: 5 componentes (Segmented, Picker, FormModal, LineCard, AddRowButton) → en cada uno `const styles = useThemedStyles(makeStyles);` y, donde haya `colors.x` inline (Picker, FormModal), `const { colors } = useTheme();`. Renombrar `StyleSheet.create` a `makeStyles`.
- `Screen.tsx`: componente `Screen` usa `colors.primary` inline (RefreshControl) y `colors.bg` en estilos → `const { colors } = useTheme();` + `const styles = useThemedStyles(makeStyles);`; renombrar factory.
- `ListView.tsx`: usa `colors.primary` inline (tintColor) → `const { colors } = useTheme();`. No tiene `StyleSheet` propio (usa spacing inline); solo añadir el hook y quitar `colors` del import.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → exit 0.
```bash
git add src/components/ui/index.tsx src/components/ui/form.tsx src/components/ui/Screen.tsx src/components/ui/ListView.tsx
git commit -m "feat(movil): UI kit theme-aware (useTheme/makeStyles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Navegación

**Files:** `navigation/MainTabs.tsx`, `navigation/RootNavigator.tsx`

- [ ] **Step 1: Convertir**

- `MainTabs.tsx`: el componente que define las tabs usa `colors.x` en `screenOptions` (tabBar/ header). Pasar a `const { colors } = useTheme();` dentro del componente; si construye estilos con `StyleSheet`, convertir a `makeStyles`/`useThemedStyles`.
- `RootNavigator.tsx`: igual; usa `colors.x` en `screenOptions` de header (`headerStyle`, `headerTintColor`, etc.) → `const { colors } = useTheme();`.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → exit 0.
```bash
git add src/navigation/MainTabs.tsx src/navigation/RootNavigator.tsx
git commit -m "feat(movil): navegacion theme-aware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Dashboard, Menú (+toggle) y Órdenes

**Files:** `dashboard/DashboardScreen.tsx`, `menu/MenuScreen.tsx`, `orders/MyOrdersScreen.tsx`, `orders/OrderDetailScreen.tsx`, `orders/AddPartModal.tsx`, `orders/PhotosScreen.tsx`, `checklists/ChecklistScreen.tsx`

- [ ] **Step 1: Convertir cada archivo con el patrón**

(En `MenuScreen`, el array `groups` usa `colors.warning/grape/...` dentro del cuerpo del componente →
funciona con `const { colors } = useTheme();`.)

- [ ] **Step 2: Toggle de tema en `MenuScreen`**

- Importar `Switch` de `react-native` y usar `const { scheme, toggle } = useTheme();` (junto al
  `const { colors } = useTheme();` — o desestructurar todo de una: `const { colors, scheme, toggle } = useTheme();`).
- Antes del botón "Cerrar sesión", añadir una Card/fila con un `Switch`:

```tsx
      <Card style={styles.themeRow}>
        <Ionicons name="moon" size={20} color={colors.dimmed} />
        <Text style={styles.themeLabel}>Modo oscuro</Text>
        <Switch value={scheme === "dark"} onValueChange={toggle} />
      </Card>
```

- Añadir a `makeStyles`:
```tsx
  themeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  themeLabel: { flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text },
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → exit 0.
```bash
git add src/features/dashboard/DashboardScreen.tsx src/features/menu/MenuScreen.tsx src/features/orders/MyOrdersScreen.tsx src/features/orders/OrderDetailScreen.tsx src/features/orders/AddPartModal.tsx src/features/orders/PhotosScreen.tsx src/features/checklists/ChecklistScreen.tsx
git commit -m "feat(movil): dashboard, menu (toggle dark mode) y ordenes theme-aware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Facturación y Compras

**Files:** `billing/QuotesScreen.tsx`, `billing/QuoteDetailScreen.tsx`, `billing/InvoicesScreen.tsx`, `billing/InvoiceDetailScreen.tsx`, `billing/PaymentModal.tsx`, `purchasing/PurchasingScreen.tsx`, `purchasing/PurchaseOrderDetailScreen.tsx`

- [ ] **Step 1: Convertir cada archivo con el patrón**

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → exit 0.
```bash
git add src/features/billing/QuotesScreen.tsx src/features/billing/QuoteDetailScreen.tsx src/features/billing/InvoicesScreen.tsx src/features/billing/InvoiceDetailScreen.tsx src/features/billing/PaymentModal.tsx src/features/purchasing/PurchasingScreen.tsx src/features/purchasing/PurchaseOrderDetailScreen.tsx
git commit -m "feat(movil): facturacion y compras theme-aware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Datos maestros, reportes y login

**Files:** `customers/CustomersScreen.tsx`, `customers/CustomerDetailScreen.tsx`, `suppliers/SuppliersScreen.tsx`, `suppliers/SupplierDetailScreen.tsx`, `equipment/EquipmentScreen.tsx`, `equipment/EquipmentDetailScreen.tsx`, `inventory/InventorySearchScreen.tsx`, `inventory/StockAdjustModal.tsx`, `reports/ReportsScreen.tsx`, `auth/LoginScreen.tsx`

- [ ] **Step 1: Convertir cada archivo con el patrón**

(Los `*FormModal.tsx` del 3c-2 — Customer/Supplier/Equipment/Product/Quote/Invoice/PurchaseOrder/
ServiceOrder — heredan estilos del UI kit y de `form.tsx`. Revisar cada uno: si **no** importan
`colors` de `../../theme`, no requieren cambios. Si importan `colors`, aplicar el patrón.)

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → exit 0.
```bash
git add -A src/features
git commit -m "feat(movil): datos maestros, reportes y login theme-aware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final

- [ ] **Step 1:** `npm run typecheck` → exit 0.
- [ ] **Step 2:** `npx expo export --platform android` → "Exported: dist".
- [ ] **Step 3:** Sin commit. Listo para prueba del usuario (`r`): en "Más" activar "Modo oscuro" →
  toda la app cambia; cerrar y reabrir la app → persiste.

## Notas
- Sin cambios de backend. `colors` estático sigue exportándose (= `lightColors`) para los mapas de
  estado y `equipment/api.ts`, que no se tocan.
- `useThemedStyles`/`useTheme` son hooks → solo dentro de componentes. Todos los usos a convertir están
  dentro de componentes función.
- Verificar con grep al final que ningún archivo de pantalla siga importando `colors` y usándolo en un
  `StyleSheet.create` a nivel de módulo (esos no cambiarían con el tema):
  `grep -rn "StyleSheet.create" src/features src/components src/navigation` y revisar que cada uno sea
  `makeStyles`.
