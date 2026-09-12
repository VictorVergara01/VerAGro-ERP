import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated, Schemas } from "../../lib/api/types";
import type { CostHistoryEntry, InventoryMovement, Product, ProductCategory } from "./types";
import type {
  EquipmentComponent,
  ProductCompatibility,
} from "../equipment/catalogTypes";

export interface ProductListParams {
  search?: string;
  category?: number;
  equipmentType?: number;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/products/", {
        params: {
          query: {
            search: params.search || undefined,
            category: params.category,
            equipment_type: params.equipmentType,
            include_inactive: params.includeInactive ? "true" : undefined,
            page: params.page,
            page_size: params.pageSize,
          } as Record<string, unknown>,
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los productos.");
      return data as unknown as Paginated<Product>;
    },
  });
}

export function useProduct(id: number | undefined) {
  return useQuery({
    queryKey: ["product", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/products/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el producto.");
      return data as Product;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["product-categories"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/categories/");
      if (error || !data) throw new Error("No se pudieron cargar las categorías.");
      return data as unknown as ProductCategory[];
    },
  });
}

export interface SupplierOption {
  id: number;
  name: string;
}

export function useSupplierOptions() {
  return useQuery({
    queryKey: ["supplier-options"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/suppliers/");
      if (error || !data) return [] as SupplierOption[];
      return (data as unknown as Paginated<SupplierOption>).results;
    },
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: ["products", "low-stock"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/low-stock/");
      if (error || !data) throw new Error("No se pudo cargar el bajo stock.");
      return data as unknown as Product[];
    },
  });
}

export function useProductMovements(id: number | undefined) {
  return useQuery({
    queryKey: ["product", id, "movements"],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/inventory/products/{id}/movements/",
        { params: { path: { id: id as number } } },
      );
      if (error || !data) throw new Error("No se pudieron cargar los movimientos.");
      return data as unknown as InventoryMovement[];
    },
  });
}

export function useProductCostHistory(productId?: number) {
  return useQuery({
    queryKey: ["product-cost-history", productId],
    enabled: productId != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/inventory/products/{id}/cost-history/",
        { params: { path: { id: productId as number } } },
      );
      if (error) throw new Error("No se pudo cargar el historial de costos.");
      return data as unknown as CostHistoryEntry[];
    },
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Product> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/inventory/products/{id}/", {
          params: { path: { id } },
          body: body as Product,
        });
        if (error) throw new Error("No se pudo guardar el producto.");
        return data as Product;
      }
      const { data, error } = await api.POST("/api/inventory/products/", {
        body: body as Product,
      });
      if (error) throw new Error("No se pudo crear el producto.");
      return data as Product;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/inventory/products/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el producto.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteManyProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map((id) =>
          api.DELETE("/api/inventory/products/{id}/", {
            params: { path: { id } },
          }),
        ),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export interface AdjustInput {
  product: number;
  movement_type: "adjustment_in" | "adjustment_out";
  quantity: string;
  unit_cost?: string;
  notes?: string;
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdjustInput) => {
      const { data, error } = await api.POST("/api/inventory/adjustments/", {
        body: input as unknown as Schemas["Adjustment"],
      });
      if (error) throw new Error("No se pudo aplicar el ajuste.");
      return data;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["product", vars.product] });
    },
  });
}

export function useComponentsByModel(modelId: number | undefined) {
  return useQuery({
    queryKey: ["equipment-components", modelId],
    enabled: modelId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/components/", {
        params: { query: { equipment_model: modelId } } as any,
      });
      if (error || !data) throw new Error("No se pudieron cargar los componentes.");
      return data as unknown as EquipmentComponent[];
    },
  });
}

export function useProductCompatibilities(productId: number | undefined) {
  return useQuery({
    queryKey: ["product-compatibilities", productId],
    enabled: productId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/product-compatibilities/", {
        params: { query: { product: productId } } as any,
      });
      if (error || !data) throw new Error("No se pudieron cargar las compatibilidades.");
      return (data as unknown as Paginated<ProductCompatibility>).results;
    },
  });
}

export function useSaveCompatibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      product: number;
      equipment_model: number;
      component: number;
      is_primary: boolean;
      notes: string;
    }) => {
      const { data, error } = await api.POST("/api/inventory/product-compatibilities/", {
        body: payload as any,
      });
      if (error) throw new Error("No se pudo guardar la compatibilidad.");
      return data as unknown as ProductCompatibility;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["product-compatibilities", vars.product] });
    },
  });
}

export function useDeleteCompatibility(productId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/inventory/product-compatibilities/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar la compatibilidad.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["product-compatibilities", productId] });
    },
  });
}
