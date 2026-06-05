import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type PurchaseOrder = components["schemas"]["PurchaseOrder"];

interface Paginated<T> {
  count: number;
  results: T[];
}

export function usePurchaseOrders(search: string) {
  return useQuery({
    queryKey: ["purchase-orders", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/purchase-orders/", {
        params: { query: { search: search || undefined } as { search?: string } },
      });
      if (error || !data) throw new Error("No se pudieron cargar las órdenes de compra.");
      return (data as unknown as Paginated<PurchaseOrder>).results;
    },
  });
}

export function usePurchaseOrder(id: number | undefined) {
  return useQuery({
    queryKey: ["purchase-order", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/purchase-orders/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar la orden.");
      return data as PurchaseOrder;
    },
  });
}

export interface POLineInput {
  product: number | null;
  quantity_ordered: string;
  unit_purchase_cost: string;
  margin_percentage: string;
}
export interface POCostInput {
  name: string;
  amount: string;
}
export interface PurchaseOrderInput {
  supplier: number;
  order_date?: string;
  expected_date?: string | null;
  currency: string;
  shipping_cost: string;
  notes: string;
  lines: POLineInput[];
  additional_costs: POCostInput[];
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseOrderInput) => {
      const { data, error } = await api.POST("/api/purchase-orders/", {
        body: input as unknown as PurchaseOrder,
      });
      if (error || !data) throw new Error("No se pudo crear la orden de compra.");
      return data as PurchaseOrder;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

export function usePOAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "send" | "cancel" | "receive-all") => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as PurchaseOrder;
      let error;
      if (action === "send") {
        ({ error } = await api.POST("/api/purchase-orders/{id}/send/", { params, body: empty }));
      } else if (action === "cancel") {
        ({ error } = await api.POST("/api/purchase-orders/{id}/cancel/", { params, body: empty }));
      } else {
        ({ error } = await api.POST("/api/purchase-orders/{id}/receive/", {
          params,
          body: { receive_all: true } as never,
        }));
      }
      if (error) throw new Error("No se pudo ejecutar la acción.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}
