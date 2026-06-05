import {
  Card,
  Modal,
  Paper,
  createTheme,
  type MantineColorsTuple,
} from "@mantine/core";

// Verde de marca Veragro (escala de 10 tonos derivada del logo).
const veragroGreen: MantineColorsTuple = [
  "#e7f8ee",
  "#d3edde",
  "#a8dbbb",
  "#79c896",
  "#54b977",
  "#3cb064",
  "#2f9e44", // 6 — color principal (light)
  "#268a3a",
  "#1d7531",
  "#0f6126",
];

const FONT = "'Inter Variable', system-ui, -apple-system, Segoe UI, sans-serif";

export const theme = createTheme({
  primaryColor: "green",
  primaryShade: { light: 6, dark: 5 },
  colors: { green: veragroGreen },
  defaultRadius: "md",
  fontFamily: FONT,
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: { fontFamily: FONT, fontWeight: "700" },
  components: {
    Card: Card.extend({
      defaultProps: { radius: "lg", withBorder: true, shadow: "sm", padding: "lg" },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "lg" },
    }),
    Modal: Modal.extend({
      defaultProps: {
        radius: "lg",
        centered: true,
        overlayProps: { backgroundOpacity: 0.55, blur: 3 },
      },
      styles: {
        title: { fontWeight: 700, fontSize: "var(--mantine-font-size-lg)" },
      },
    }),
  },
});
