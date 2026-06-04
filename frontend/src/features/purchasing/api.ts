import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { PurchaseOrder } from "./types";

export interface POListParams {
  search?: string;
  status?: string;
  supplier?: number;
  page?: number;
}

export function usePurchaseOrders(params: POListParams) {
  return useQuery({
    queryKey: ["purchase-orders", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/purchase-orders/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            supplier: params.supplier,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar las órdenes.");
      return data as unknown as Paginated<PurchaseOrder>;
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

export interface CreateLineInput {
  product: number;
  quantity_ordered: string;
  unit_purchase_cost: string;
  margin_percentage?: string;
}
export interface CreateCostInput {
  name: string;
  amount: string;
}
export interface CreatePOInput {
  supplier: number;
  order_date?: string;
  expected_date?: string | null;
  currency?: string;
  shipping_cost?: string;
  notes?: string;
  lines: CreateLineInput[];
  additional_costs: CreateCostInput[];
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePOInput) => {
      const { data, error } = await api.POST("/api/purchase-orders/", {
        body: input as unknown as PurchaseOrder,
      });
      if (error || !data) throw new Error("No se pudo crear la orden.");
      return data as PurchaseOrder;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

type POAction = "send" | "recalculate" | "cancel";

export function usePurchaseOrderAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: POAction) => {
      const path = { path: { id: id as number } };
      // Las acciones no requieren body real; el tipo lo exige (serializer de la orden).
      const empty = {} as unknown as PurchaseOrder;
      const map = {
        send: () =>
          api.POST("/api/purchase-orders/{id}/send/", { params: path, body: empty }),
        recalculate: () =>
          api.POST("/api/purchase-orders/{id}/recalculate/", {
            params: path,
            body: empty,
          }),
        cancel: () =>
          api.POST("/api/purchase-orders/{id}/cancel/", { params: path, body: empty }),
      };
      const { data, error } = await map[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as PurchaseOrder;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export interface Receipt {
  line: number;
  quantity: string;
}

export function useReceivePurchaseOrder(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { receive_all: true } | { receipts: Receipt[] }) => {
      const { data, error } = await api.POST("/api/purchase-orders/{id}/receive/", {
        params: { path: { id: id as number } },
        body: body as unknown as PurchaseOrder,
      });
      if (error) throw new Error("No se pudo registrar la recepción.");
      return data as PurchaseOrder;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
