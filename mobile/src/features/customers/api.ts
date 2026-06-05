import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Customer = components["schemas"]["Customer"];

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

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  person: "Persona",
  company: "Empresa",
};
