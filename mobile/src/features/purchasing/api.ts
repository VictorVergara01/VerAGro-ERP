import { useQuery } from "@tanstack/react-query";

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
