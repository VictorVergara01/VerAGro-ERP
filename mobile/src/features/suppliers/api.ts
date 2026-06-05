import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Supplier = components["schemas"]["Supplier"];

export interface SupplierInput {
  name: string;
  legal_name?: string;
  contact_person?: string;
  country?: string;
  phone?: string;
  email?: string;
  payment_terms?: string;
}

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

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/suppliers/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el proveedor.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: SupplierInput }) => {
      if (id) {
        const { error } = await api.PATCH("/api/suppliers/{id}/", {
          params: { path: { id } },
          body: input as unknown as Supplier,
        });
        if (error) throw new Error("No se pudo guardar el proveedor.");
      } else {
        const { error } = await api.POST("/api/suppliers/", {
          body: input as unknown as Supplier,
        });
        if (error) throw new Error("No se pudo crear el proveedor.");
      }
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (vars.id) void qc.invalidateQueries({ queryKey: ["supplier", vars.id] });
    },
  });
}
