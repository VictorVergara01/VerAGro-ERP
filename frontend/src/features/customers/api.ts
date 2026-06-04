import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { Customer } from "./types";

export interface CustomerListParams {
  search?: string;
  includeInactive?: boolean;
  page?: number;
}

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/customers/", {
        params: {
          query: {
            search: params.search || undefined,
            include_inactive: params.includeInactive ? "true" : undefined,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los clientes.");
      return data as unknown as Paginated<Customer>;
    },
  });
}

export function useCustomer(id: number | undefined) {
  return useQuery({
    queryKey: ["customer", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/customers/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el cliente.");
      return data as Customer;
    },
  });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Customer> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/customers/{id}/", {
          params: { path: { id } },
          body: body as Customer,
        });
        if (error) throw new Error("No se pudo guardar el cliente.");
        return data as Customer;
      }
      const { data, error } = await api.POST("/api/customers/", {
        body: body as Customer,
      });
      if (error) throw new Error("No se pudo crear el cliente.");
      return data as Customer;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export interface ServiceOrderSummary {
  id: number;
  service_order_number: string;
  status: string;
  service_type: string;
  received_date: string | null;
  finished_date: string | null;
  total_amount: string;
}

export interface InvoiceSummary {
  id: number;
  invoice_number: string;
  invoice_type: string;
  status: string;
  issue_date: string | null;
  total: string;
  balance_due: string;
}

export function useCustomerServiceOrders(id: number | undefined) {
  return useQuery({
    queryKey: ["customer", id, "service-orders"],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/customers/{id}/service-orders/",
        { params: { path: { id: id as number } } },
      );
      if (error) throw new Error("No se pudo cargar el historial.");
      return (data as unknown as Paginated<ServiceOrderSummary>).results;
    },
  });
}

export function useCustomerInvoices(id: number | undefined) {
  return useQuery({
    queryKey: ["customer", id, "invoices"],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/customers/{id}/invoices/", {
        params: { path: { id: id as number } },
      });
      if (error) throw new Error("No se pudo cargar el historial.");
      return (data as unknown as Paginated<InvoiceSummary>).results;
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/customers/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el cliente.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
