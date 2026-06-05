import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Invoice = components["schemas"]["Invoice"];
export type Quote = components["schemas"]["Quote"];

interface Paginated<T> {
  count: number;
  results: T[];
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
