import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { Invoice, Quote } from "./types";

// ---------- Cotizaciones ----------

export interface QuoteListParams {
  search?: string;
  status?: string;
  page?: number;
}

export function useQuotes(params: QuoteListParams) {
  return useQuery({
    queryKey: ["quotes", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/quotes/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar las cotizaciones.");
      return data as unknown as Paginated<Quote>;
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

export function useQuoteAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as Quote;
      const { data, error } =
        action === "approve"
          ? await api.POST("/api/quotes/{id}/approve/", { params, body: empty })
          : await api.POST("/api/quotes/{id}/reject/", { params, body: empty });
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as Quote;
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
      if (error) throw new Error("No se pudo convertir la cotización.");
      return data as unknown as Invoice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quote", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ---------- Facturas ----------

export interface InvoiceListParams {
  search?: string;
  status?: string;
  invoiceType?: string;
  page?: number;
}

export function useInvoices(params: InvoiceListParams) {
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/invoices/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            invoice_type: params.invoiceType || undefined,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar las facturas.");
      return data as unknown as Paginated<Invoice>;
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

function invalidateInvoice(qc: ReturnType<typeof useQueryClient>, id?: number) {
  void qc.invalidateQueries({ queryKey: ["invoice", id] });
  void qc.invalidateQueries({ queryKey: ["invoices"] });
}

export function useInvoiceAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "issue" | "cancel") => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as Invoice;
      const { data, error } =
        action === "issue"
          ? await api.POST("/api/invoices/{id}/issue/", { params, body: empty })
          : await api.POST("/api/invoices/{id}/cancel/", { params, body: empty });
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as Invoice;
    },
    onSuccess: () => {
      invalidateInvoice(qc, id);
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export interface PaymentInput {
  amount: string;
  method: string;
  reference_number?: string;
  notes?: string;
}

export function useRecordPayment(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentInput) => {
      const { data, error } = await api.POST("/api/invoices/{id}/payments/", {
        params: { path: { id: id as number } },
        body: input as unknown as Invoice,
      });
      if (error) throw new Error("No se pudo registrar el pago.");
      return data as Invoice;
    },
    onSuccess: () => invalidateInvoice(qc, id),
  });
}
