import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Invoice = components["schemas"]["Invoice"];
export type Quote = components["schemas"]["Quote"];

interface Paginated<T> {
  count: number;
  results: T[];
}

/** Datos del documento fiscal (CUFE/CAFE) anidados en la factura. El backend lo
 * expone como SerializerMethodField, así que el schema lo tipa `string`; se lee
 * casteando con `invoiceFiscal`. */
export interface FiscalInfo {
  cufe: string;
  status: string;
  status_display: string;
  protocol: string;
  environment: string;
  issued_at: string;
}

/** Datos fiscales de la factura, o null si aún no se emitió la FEL. */
export function invoiceFiscal(invoice: Invoice): FiscalInfo | null {
  return (invoice.fiscal as unknown as FiscalInfo | null) ?? null;
}

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  service_invoice: "Servicio",
  final_invoice: "Final",
  product_sale: "Venta producto",
};

export function useInvoices(search: string) {
  return useQuery({
    queryKey: ["invoices", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/invoices/", {
        params: { query: { search: search || undefined } as { search?: string } },
      });
      if (error || !data) throw new Error("No se pudieron cargar las facturas.");
      return (data as unknown as Paginated<Invoice>).results;
    },
  });
}

export function useInvoice(id: number | undefined) {
  return useQuery({
    queryKey: ["invoice", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/invoices/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar la factura.");
      return data as Invoice;
    },
  });
}

export function useQuotes(search: string) {
  return useQuery({
    queryKey: ["quotes", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/quotes/", {
        params: { query: { search: search || undefined } as { search?: string } },
      });
      if (error || !data) throw new Error("No se pudieron cargar las cotizaciones.");
      return (data as unknown as Paginated<Quote>).results;
    },
  });
}

export function useQuote(id: number | undefined) {
  return useQuery({
    queryKey: ["quote", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/quotes/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar la cotización.");
      return data as Quote;
    },
  });
}

// ---------- Acciones de factura ----------
export function useInvoiceAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "issue" | "cancel") => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as Invoice;
      const { error } =
        action === "issue"
          ? await api.POST("/api/invoices/{id}/issue/", { params, body: empty })
          : await api.POST("/api/invoices/{id}/cancel/", { params, body: empty });
      if (error) throw new Error("No se pudo ejecutar la acción.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useEmitFiscal(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/invoices/{id}/emit-fiscal/", {
        params: { path: { id: id as number } },
        body: {} as unknown as Invoice,
      });
      if (error) throw new Error("No se pudo emitir la factura electrónica.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useRecordPayment(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount: string;
      method: string;
      reference_number?: string;
      notes?: string;
    }) => {
      const { error } = await api.POST("/api/invoices/{id}/payments/", {
        params: { path: { id: id as number } },
        body: input as never,
      });
      if (error) throw new Error("No se pudo registrar el pago.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ---------- Acciones de cotización ----------
export function useQuoteAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as Quote;
      const { error } =
        action === "approve"
          ? await api.POST("/api/quotes/{id}/approve/", { params, body: empty })
          : await api.POST("/api/quotes/{id}/reject/", { params, body: empty });
      if (error) throw new Error("No se pudo ejecutar la acción.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quote", id] });
      void qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

export function useConvertQuote(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/quotes/{id}/convert-to-invoice/", {
        params: { path: { id: id as number } },
        body: {} as unknown as Quote,
      });
      if (error || !data) throw new Error("No se pudo convertir la cotización.");
      return data as unknown as Invoice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quote", id] });
      void qc.invalidateQueries({ queryKey: ["quotes"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ---------- Opciones ----------
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

// ---------- Cotización: crear/editar ----------
export interface QuoteLineInput {
  line_type: string;
  description: string;
  quantity: string;
  unit_price: string;
}
export interface QuoteInput {
  customer: number;
  issue_date?: string;
  expiration_date?: string | null;
  discount_percentage: string;
  tax_percentage: string;
  notes: string;
  terms: string;
  lines: QuoteLineInput[];
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteInput) => {
      const { data, error } = await api.POST("/api/quotes/", {
        body: input as unknown as Quote,
      });
      if (error || !data) throw new Error("No se pudo crear la cotización.");
      return data as Quote;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useUpdateQuote(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteInput) => {
      const { data, error } = await api.PATCH("/api/quotes/{id}/", {
        params: { path: { id: id as number } },
        body: input as unknown as Quote,
      });
      if (error || !data) throw new Error("No se pudo guardar la cotización.");
      return data as Quote;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quote", id] });
      void qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

// ---------- Factura: crear/editar ----------
export interface InvoiceLineInput {
  line_type: string;
  product: number | null;
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
}
export interface InvoiceInput {
  customer: number;
  invoice_type: string;
  issue_date?: string;
  due_date?: string | null;
  discount_percentage: string;
  tax_percentage: string;
  notes: string;
  lines: InvoiceLineInput[];
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvoiceInput) => {
      const { data, error } = await api.POST("/api/invoices/", {
        body: input as unknown as Invoice,
      });
      if (error || !data) throw new Error("No se pudo crear la factura.");
      return data as Invoice;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useUpdateInvoice(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvoiceInput) => {
      const { data, error } = await api.PATCH("/api/invoices/{id}/", {
        params: { path: { id: id as number } },
        body: input as unknown as Invoice,
      });
      if (error || !data) throw new Error("No se pudo guardar la factura.");
      return data as Invoice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
