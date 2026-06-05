import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type Product = components["schemas"]["Product"];
export type ProductCategory = components["schemas"]["ProductCategory"];

export interface ProductInput {
  sku: string;
  name: string;
  category: number | null;
  brand?: string;
  model?: string;
  unit_of_measure?: string;
  location?: string;
  minimum_stock?: string;
  sale_price?: string;
  default_margin_percentage?: string;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function useProductSearch(search: string) {
  return useQuery({
    queryKey: ["product-search", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/products/", {
        params: { query: { search: search || undefined } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los productos.");
      return (data as unknown as Paginated<Product>).results;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/categories/");
      if (error || !data) throw new Error("No se pudieron cargar las categorías.");
      return data as unknown as ProductCategory[];
    },
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: ProductInput }) => {
      if (id) {
        const { error } = await api.PATCH("/api/inventory/products/{id}/", {
          params: { path: { id } },
          body: input as unknown as Product,
        });
        if (error) throw new Error("No se pudo guardar el producto.");
      } else {
        const { error } = await api.POST("/api/inventory/products/", {
          body: input as unknown as Product,
        });
        if (error) throw new Error("No se pudo crear el producto.");
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["product-search"] }),
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["product-search"] }),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product: number;
      movement_type: string;
      quantity: string;
      notes?: string;
    }) => {
      const body = {
        product: input.product,
        movement_type: input.movement_type,
        quantity: input.quantity,
        unit_cost: "0",
        notes: input.notes ?? "",
      };
      const { error } = await api.POST("/api/inventory/adjustments/", {
        body: body as never,
      });
      if (error) throw new Error("No se pudo ajustar el stock.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["product-search"] }),
  });
}
