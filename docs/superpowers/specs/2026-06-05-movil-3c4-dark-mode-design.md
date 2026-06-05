# Móvil Fase 3c-4 — Dark mode (toggle manual)

Cuarto y último slice de la Fase 3c. Puramente frontend móvil. Gate: `npm run typecheck` + `expo export`.

## Contexto

El `theme.ts` exporta un objeto `colors` estático importado en 30 archivos, muchos dentro de
`StyleSheet.create({...})` (que captura el valor al cargar el módulo). Un toggle de tema en runtime
exige leer los colores **estructurales** dinámicamente. Hay 202 usos de colores estructurales
(`bg/card/text/dimmed/border/headerBg`) en 30 archivos; 22 archivos usan `StyleSheet.create`.

Decisiones del usuario: **toggle manual** (claro/oscuro), preferencia **persistida con
`expo-secure-store`** (ya es dep), default **claro**, toggle en la pestaña **"Más"**.

## Técnica: sombrear `colors` para minimizar churn

En cada componente que use colores estructurales:
- `const { colors } = useTheme();` → variable local `colors` para los usos **inline** en JSX (sin cambiar
  esas referencias).
- El `const styles = StyleSheet.create({...})` a nivel de módulo pasa a una **fábrica**
  `const makeStyles = (colors: ThemeColors) => StyleSheet.create({...})`, y en el componente
  `const styles = useThemedStyles(makeStyles);`. El cuerpo de los estilos **no cambia** (las
  referencias `colors.x` ahora resuelven al parámetro).

Resultado: ~2-3 ediciones por archivo, sin reescribir estilos.

## Infraestructura — `theme.ts`

- `accent` = `{ primary, primaryDark, primarySoft, danger, warning, info, grape, teal }` — **igual en
  ambos temas**.
- `lightColors` = `{ ...accent, bg:"#f1f3f5", card:"#ffffff", text:"#1a1b1e", dimmed:"#868e96",
  border:"#e9ecef", headerBg:"#f8f9fa" }` (los actuales).
- `darkColors` = `{ ...accent, bg:"#121417", card:"#1e2126", text:"#e9ecef", dimmed:"#909296",
  border:"#2c2e33", headerBg:"#1a1c20" }`.
- `export type ThemeColors = typeof lightColors;`
- `export const colors = lightColors;` — **back-compat** para usos a nivel de módulo (mapas de estado,
  `equipment/api.ts`); esos archivos **no se tocan**.
- `spacing`, `radius`, `font`, `softBg`, y los mapas de estado (`statusColors`, `invoiceStatusColors`,
  etc.) siguen estáticos (theme-independientes).
- `ThemeContext` + `ThemeProvider`:
  - estado `scheme: "light" | "dark"` (default `"light"`), cargado de SecureStore (clave
    `veragro.theme`) al montar.
  - `toggle()` alterna y persiste; expone `{ colors, scheme, toggle }`.
- `useTheme(): { colors: ThemeColors; scheme: "light"|"dark"; toggle: () => void }`.
- `useThemedStyles<T>(factory: (c: ThemeColors) => T): T` = `useMemo(() => factory(colors), [colors])`
  con `colors` del contexto.

## Cableado

### `App.tsx`
- Envolver el árbol con `<ThemeProvider>` (dentro de `SafeAreaProvider`, fuera o dentro de
  `QueryClientProvider` — debe envolver `NavigationContainer` y `RootNavigator`).
- `StatusBar` y el tema de `NavigationContainer` siguen el scheme. Como ambos necesitan el contexto,
  extraer un componente interno (p.ej. `ThemedApp`) que use `useTheme()` y pase:
  - `<StatusBar style={scheme === "dark" ? "light" : "dark"} />`
  - `NavigationContainer theme={navTheme}` con `DarkTheme`/`DefaultTheme` de
    `@react-navigation/native` y `colors.background = colors.bg`, `card = colors.card`,
    `text = colors.text`, `border = colors.border`, `primary = colors.primary`.

### Archivos a convertir (22 con `StyleSheet.create` + inline)
UI kit: `components/ui/index.tsx`, `components/ui/form.tsx`, `components/ui/Screen.tsx`,
`components/ui/ListView.tsx`. Navegación: `navigation/MainTabs.tsx`, `navigation/RootNavigator.tsx`.
Features: `dashboard/DashboardScreen`, `menu/MenuScreen`, `orders/{MyOrdersScreen,OrderDetailScreen,
AddPartModal,PhotosScreen}`, `checklists/ChecklistScreen`, `billing/{QuotesScreen,QuoteDetailScreen,
InvoicesScreen,InvoiceDetailScreen,PaymentModal}`, `purchasing/{PurchasingScreen,
PurchaseOrderDetailScreen}`, `customers/{CustomersScreen,CustomerDetailScreen}`,
`suppliers/{SuppliersScreen,SupplierDetailScreen}`, `equipment/{EquipmentScreen,EquipmentDetailScreen}`,
`inventory/{InventorySearchScreen,StockAdjustModal}`, `reports/ReportsScreen`, `auth/LoginScreen`.

(Los `*FormModal.tsx` nuevos del 3c-2 usan el UI kit + `form.tsx`; revisar si referencian `colors`
directamente; si no, no requieren cambios.)

`equipment/api.ts` y los mapas de estado de `theme.ts` **no cambian** (usan accent/estáticos).

### Toggle — `MenuScreen`
Añadir, antes de "Cerrar sesión", una fila con `Switch` (RN) "Modo oscuro" ligada a
`const { scheme, toggle } = useTheme();` (`value={scheme === "dark"} onValueChange={toggle}`).

## Conversión por archivo (patrón)
1. Import: quitar `colors` del import estático de `../../theme` (o `../theme`); **mantener**
   `spacing/radius/font/softBg/...`; añadir `useTheme` y/o `useThemedStyles`, y `type ThemeColors`.
2. En el componente: `const { colors } = useTheme();` (si hay usos inline) y
   `const styles = useThemedStyles(makeStyles);` (si hay StyleSheet).
3. Renombrar `const styles = StyleSheet.create({` → `const makeStyles = (colors: ThemeColors) => StyleSheet.create({`.
4. Componentes que reciben colores a nivel de módulo fuera de un componente React no pueden usar el
   hook; si los hay (no debería en estos archivos), dejarlos en `colors` estático.

## Fuera de alcance
- Detección automática del tema del sistema (solo toggle manual).
- Re-tematizar los mapas de color de estado (se mantienen iguales en ambos temas, contrastan bien).

## Verificación
- `npm run typecheck` (exit 0) tras cada commit.
- `npx expo export --platform android`.
- Prueba del usuario (`r`): en "Más", activar "Modo oscuro" → toda la app cambia; cerrar y reabrir la
  app → la preferencia persiste.
