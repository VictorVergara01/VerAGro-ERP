import type { Schemas } from "../../lib/api/types";

export type FieldJob = Schemas["FieldJob"];

export const JOB_TYPE_OPTIONS = [
  { value: "fumigation", label: "Fumigación" },
  { value: "spreading", label: "Esparcido / abono" },
];
export const JOB_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  JOB_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

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

export const RATE_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "mL/ha", label: "mL/ha" },
  { value: "kg/ha", label: "kg/ha" },
  { value: "cc/ha", label: "cc/ha" },
];

export interface SprayMixProduct {
  name: string;
  dose_per_liter: number;
  dose_unit: "mL/L" | "cc/L";
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
