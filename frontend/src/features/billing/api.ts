import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { Invoice } from "./types";

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

export interface InvoiceLineInput {
  product?: number | null;
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  line_type: string;
}
export interface CreateInvoiceInput {
  customer: number;
  invoice_type: string;
  issue_date?: string;
  due_date?: string | null;
  discount_percentage?: string;
  tax_percentage?: string;
  notes?: string;
  lines: InvoiceLineInput[];
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { data, error } = await api.POST("/api/invoices/", {
        body: input as unknown as Invoice,
      });
      if (error || !data) throw new Error("No se pudo crear la factura.");
      return data as Invoice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpdateInvoice(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { data, error } = await api.PATCH("/api/invoices/{id}/", {
        params: { path: { id: id as number } },
        body: input as unknown as Invoice,
      });
      if (error || !data) throw new Error("No se pudo actualizar la factura.");
      return data as Invoice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
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
  for (const key of ["field-account", "field-accounts", "field-finance", "report"]) void qc.invalidateQueries({ queryKey: [key] });
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

export function useEmitFiscal(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/invoices/{id}/emit-fiscal/", {
        params: { path: { id: id as number } },
        body: {} as unknown as Invoice,
      });
      if (error) throw new Error("No se pudo emitir la factura electrónica.");
      return data as Invoice;
    },
    onSuccess: () => invalidateInvoice(qc, id),
  });
}

export interface PaymentInput {
  request_id?: string;
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
