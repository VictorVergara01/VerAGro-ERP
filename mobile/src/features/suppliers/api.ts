import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Supplier = components["schemas"]["Supplier"];

interface Paginated<T> {
  count: number;
  results: T[];
}

export function useSuppliers(search: string) {
  return useQuery({
    queryKey: ["suppliers", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/suppliers/", {
        params: { query: { search: search || undefined } as { search?: string } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los proveedores.");
      return (data as unknown as Paginated<Supplier>).results;
    },
  });
}

export function useSupplier(id: number | undefined) {
  return useQuery({
    queryKey: ["supplier", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/suppliers/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el proveedor.");
      return data as Supplier;
    },
  });
}
