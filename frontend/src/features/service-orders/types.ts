import type { Schemas } from "../../lib/api/types";

export type ServiceOrder = Schemas["ServiceOrder"];
export type ServiceOrderPart = Schemas["ServiceOrderPart"];

export const SERVICE_TYPE_OPTIONS = [
  { value: "diagnostic", label: "Diagnóstico" },
  { value: "preventive_maintenance", label: "Mant. preventivo" },
  { value: "corrective_maintenance", label: "Mant. correctivo" },
  { value: "repair", label: "Reparación" },
  { value: "cleaning", label: "Limpieza" },
  { value: "calibration", label: "Calibración" },
  { value: "other", label: "Otro" },
];
export const SERVICE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  SERVICE_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export const SO_STATUS_OPTIONS = [
  { value: "received", label: "Recibida" },
  { value: "in_diagnostic", label: "En diagnóstico" },
  { value: "quoted", label: "Cotizada" },
  { value: "approved", label: "Aprobada" },
  { value: "in_progress", label: "En proceso" },
  { value: "waiting_parts", label: "Esperando piezas" },
  { value: "finished", label: "Finalizada" },
  { value: "invoiced", label: "Facturada" },
  { value: "delivered", label: "Entregada" },
  { value: "cancelled", label: "Cancelada" },
];
export const SO_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  SO_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
export const SO_STATUS_COLOR: Record<string, string> = {
  received: "gray",
  in_diagnostic: "cyan",
  quoted: "indigo",
  approved: "blue",
  in_progress: "yellow",
  waiting_parts: "orange",
  finished: "teal",
  invoiced: "grape",
  delivered: "green",
  cancelled: "red",
};

export const PART_STATUS_LABEL: Record<string, string> = {
  required: "Requerida",
  reserved: "Reservada",
  used: "Usada",
  pending_purchase: "Pend. compra",
  returned: "Devuelta",
};
export const PART_STATUS_COLOR: Record<string, string> = {
  required: "gray",
  reserved: "blue",
  used: "green",
  pending_purchase: "orange",
  returned: "red",
};
