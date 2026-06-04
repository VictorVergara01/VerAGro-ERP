import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { PurchaseHistoryItem, Supplier, SupplierProduct } from "./types";

export interface SupplierListParams {
  search?: string;
  includeInactive?: boolean;
  page?: number;
}

export function useSuppliers(params: SupplierListParams) {
  return useQuery({
    queryKey: ["suppliers", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/suppliers/", {
        params: {
          query: {
            search: params.search || undefined,
            include_inactive: params.includeInactive ? "true" : undefined,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los proveedores.");
      return data as unknown as Paginated<Supplier>;
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

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Supplier> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/suppliers/{id}/", {
          params: { path: { id } },
          body: body as Supplier,
        });
        if (error) throw new Error("No se pudo guardar el proveedor.");
        return data as Supplier;
      }
      const { data, error } = await api.POST("/api/suppliers/", {
        body: body as Supplier,
      });
      if (error) throw new Error("No se pudo crear el proveedor.");
      return data as Supplier;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

// --- Productos del proveedor (SupplierProduct) ---

export function useSupplierProducts(supplierId: number | undefined) {
  return useQuery({
    queryKey: ["supplier", supplierId, "products"],
    enabled: supplierId != null,
    queryFn: async () => {
      // El backend filtra por ?supplier= aunque el OpenAPI no lo declare.
      const query = { supplier: supplierId } as { page?: number; supplier?: number };
      const { data, error } = await api.GET("/api/supplier-products/", {
        params: { query },
      });
      if (error || !data) throw new Error("No se pudieron cargar los productos.");
      return (data as unknown as Paginated<SupplierProduct>).results;
    },
  });
}

export function useSaveSupplierProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<SupplierProduct> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/supplier-products/{id}/", {
          params: { path: { id } },
          body: body as SupplierProduct,
        });
        if (error) throw new Error("No se pudo guardar la relación.");
        return data as SupplierProduct;
      }
      const { data, error } = await api.POST("/api/supplier-products/", {
        body: body as SupplierProduct,
      });
      if (error) throw new Error("No se pudo asociar el producto.");
      return data as SupplierProduct;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["supplier", vars.supplier, "products"] });
    },
  });
}

export function useDeleteSupplierProduct(supplierId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/supplier-products/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo quitar el producto.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["supplier", supplierId, "products"] });
    },
  });
}

export function useSupplierPurchaseHistory(id: number | undefined) {
  return useQuery({
    queryKey: ["supplier", id, "purchase-history"],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/suppliers/{id}/purchase-history/",
        { params: { path: { id: id as number } } },
      );
      if (error) throw new Error("No se pudo cargar el historial.");
      return (data as unknown as Paginated<PurchaseHistoryItem>).results;
    },
  });
}
