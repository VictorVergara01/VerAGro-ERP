import type { Schemas } from "../../lib/api/types";

export type ServiceChecklist = Schemas["ServiceChecklist"];
export type ServiceChecklistItem = Schemas["ServiceChecklistItem"];
export type ChecklistTemplate = Schemas["ChecklistTemplate"];

export const ITEM_STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "ok", label: "OK" },
  { value: "fail", label: "Falla" },
  { value: "requires_replacement", label: "Requiere reemplazo" },
  { value: "not_applicable", label: "No aplica" },
];
export const ITEM_STATUS_COLOR: Record<string, string> = {
  pending: "gray",
  ok: "green",
  fail: "red",
  requires_replacement: "orange",
  not_applicable: "dark",
};

export const PRIORITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];
