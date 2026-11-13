import type { Schemas } from "../../lib/api/types";

export type FieldJob = Schemas["FieldJob"];

export const JOB_TYPE_OPTIONS = [
  { value: "fumigation", label: "Pulverización" },
  { value: "spreading", label: "Aplicación de sólidos" },
];
export const JOB_TYPE_LABEL: Record<string, string> = Object.fromEntries(JOB_TYPE_OPTIONS.map((o) => [o.value, o.label]));
export const SOLID_UNIT_OPTIONS = [
  { value: "qq/ha", label: "qq/ha" },
  { value: "kg/ha", label: "kg/ha" },
  { value: "g/ha", label: "g/ha" },
];

export const BILLING_UNIT_OPTIONS = [
  { value: "ha", label: "Por hectárea" },
  { value: "qq", label: "Por quintal (qq)" },
];

export const FJ_STATUS_OPTIONS = [
  { value: "scheduled", label: "Programado" },
  { value: "done", label: "Hecho" },
  { value: "invoiced", label: "Facturado" },
  { value: "cancelled", label: "Cancelado" },
];
export const FJ_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  FJ_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
export const FJ_STATUS_COLOR: Record<string, string> = {
  scheduled: "blue",
  done: "teal",
  invoiced: "grape",
  cancelled: "red",
};

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

export interface SprayMixProduct {
  name: string;
  dose_per_hectare: number;
  unit: string;
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

export interface SprayMixPrefill {
  hectares?: number;
  caldo_per_hectare?: number;
  tank_volume_liters?: number;
  products?: SprayMixProduct[];
}
