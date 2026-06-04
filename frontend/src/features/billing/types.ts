import type { Schemas } from "../../lib/api/types";

export type Quote = Schemas["Quote"];
export type QuoteLine = Schemas["QuoteLine"];
export type Invoice = Schemas["Invoice"];
export type InvoiceLine = Schemas["InvoiceLine"];
export type Payment = Schemas["Payment"];

export const QUOTE_STATUS_OPTIONS = [
  { value: "draft", label: "Borrador" },
  { value: "sent", label: "Enviada" },
  { value: "approved", label: "Aprobada" },
  { value: "rejected", label: "Rechazada" },
  { value: "expired", label: "Expirada" },
  { value: "converted_to_invoice", label: "Convertida" },
];
export const QUOTE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  QUOTE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
export const QUOTE_STATUS_COLOR: Record<string, string> = {
  draft: "gray",
  sent: "blue",
  approved: "green",
  rejected: "red",
  expired: "orange",
  converted_to_invoice: "grape",
};

export const INVOICE_STATUS_OPTIONS = [
  { value: "draft", label: "Borrador" },
  { value: "issued", label: "Emitida" },
  { value: "partially_paid", label: "Pago parcial" },
  { value: "paid", label: "Pagada" },
  { value: "cancelled", label: "Cancelada" },
];
export const INVOICE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  INVOICE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
export const INVOICE_STATUS_COLOR: Record<string, string> = {
  draft: "gray",
  issued: "blue",
  partially_paid: "orange",
  paid: "green",
  cancelled: "red",
};

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  service_invoice: "Servicio",
  final_invoice: "Final",
  product_sale: "Venta producto",
};

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "bank_transfer", label: "Transferencia" },
  { value: "yappy", label: "Yappy" },
  { value: "ach", label: "ACH" },
  { value: "card", label: "Tarjeta" },
  { value: "other", label: "Otro" },
];
export const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
);

export const LINE_TYPE_OPTIONS = [
  { value: "product", label: "Producto" },
  { value: "service", label: "Servicio" },
  { value: "labor", label: "Mano de obra" },
  { value: "diagnostic", label: "Diagnóstico" },
  { value: "other", label: "Otro" },
];

export const INVOICE_TYPE_OPTIONS = [
  { value: "service_invoice", label: "Servicio" },
  { value: "final_invoice", label: "Final" },
  { value: "product_sale", label: "Venta de producto" },
];
