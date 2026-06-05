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

export const statusColors: Record<string, string> = {
  received: "#868e96",
  in_diagnostic: "#15aabf",
  quoted: "#4263eb",
  approved: "#1971c2",
  in_progress: "#f08c00",
  waiting_parts: "#e8590c",
  finished: "#0ca678",
  invoiced: "#9c36b5",
  delivered: "#2f9e44",
  cancelled: "#e03131",
};

export const statusLabels: Record<string, string> = {
  received: "Recibida",
  in_diagnostic: "En diagnóstico",
  quoted: "Cotizada",
  approved: "Aprobada",
  in_progress: "En proceso",
  waiting_parts: "Esperando piezas",
  finished: "Finalizada",
  invoiced: "Facturada",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

export const invoiceStatusColors: Record<string, string> = {
  draft: "#868e96",
  issued: "#1971c2",
  partially_paid: "#f08c00",
  paid: "#2f9e44",
  cancelled: "#e03131",
};

export const invoiceStatusLabels: Record<string, string> = {
  draft: "Borrador",
  issued: "Emitida",
  partially_paid: "Pago parcial",
  paid: "Pagada",
  cancelled: "Cancelada",
};

export const quoteStatusColors: Record<string, string> = {
  draft: "#868e96",
  sent: "#1971c2",
  approved: "#2f9e44",
  rejected: "#e03131",
  expired: "#f08c00",
  converted_to_invoice: "#9c36b5",
};

export const quoteStatusLabels: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Expirada",
  converted_to_invoice: "Convertida",
};

export const poStatusColors: Record<string, string> = {
  draft: "#868e96",
  sent: "#1971c2",
  partially_received: "#f08c00",
  received: "#2f9e44",
  cancelled: "#e03131",
};

export const poStatusLabels: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  partially_received: "Recibida parcial",
  received: "Recibida",
  cancelled: "Cancelada",
};

export const serviceTypeLabels: Record<string, string> = {
  diagnostic: "Diagnóstico",
  preventive_maintenance: "Mant. preventivo",
  corrective_maintenance: "Mant. correctivo",
  repair: "Reparación",
  cleaning: "Limpieza",
  calibration: "Calibración",
  other: "Otro",
};

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
