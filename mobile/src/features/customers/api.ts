import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Customer = components["schemas"]["Customer"];

export interface CustomerInput {
  name: string;
  customer_type: string;
  legal_name?: string;
  identification_number?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  province?: string;
  district?: string;
  address?: string;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

export function useCustomers(search: string) {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/customers/", {
        params: { query: { search: search || undefined } as { search?: string } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los clientes.");
      return (data as unknown as Paginated<Customer>).results;
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
    mutationFn: async ({ id, input }: { id?: number; input: CustomerInput }) => {
      if (id) {
        const { error } = await api.PATCH("/api/customers/{id}/", {
          params: { path: { id } },
          body: input as unknown as Customer,
        });
        if (error) throw new Error("No se pudo guardar el cliente.");
      } else {
        const { error } = await api.POST("/api/customers/", {
          body: input as unknown as Customer,
        });
        if (error) throw new Error("No se pudo crear el cliente.");
      }
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
      if (vars.id) void qc.invalidateQueries({ queryKey: ["customer", vars.id] });
    },
  });
}

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  person: "Persona",
  company: "Empresa",
};
