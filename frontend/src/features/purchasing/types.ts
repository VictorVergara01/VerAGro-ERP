import type { Schemas } from "../../lib/api/types";

export type PurchaseOrder = Schemas["PurchaseOrder"];
export type PurchaseOrderLine = Schemas["PurchaseOrderLine"];
export type PurchaseAdditionalCost = Schemas["PurchaseAdditionalCost"];

export const PO_STATUS_OPTIONS = [
  { value: "draft", label: "Borrador" },
  { value: "sent", label: "Enviada" },
  { value: "partially_received", label: "Parcialmente recibida" },
  { value: "received", label: "Recibida" },
  { value: "cancelled", label: "Cancelada" },
];

export const PO_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  PO_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export const PO_STATUS_COLOR: Record<string, string> = {
  draft: "gray",
  sent: "blue",
  partially_received: "orange",
  received: "green",
  cancelled: "red",
};

export const EDITABLE_PO = ["draft", "sent"];
