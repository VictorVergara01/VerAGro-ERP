import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type ServiceOrder = components["schemas"]["ServiceOrder"];
export type ServiceOrderPart = components["schemas"]["ServiceOrderPart"];

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function useMyOrders(technicianId: number | undefined, all: boolean) {
  return useQuery({
    queryKey: ["my-orders", technicianId, all],
    queryFn: async () => {
      // El OpenAPI no declara ?technician= (la vista lo lee a mano).
      const query = {
        technician: all ? undefined : technicianId,
      } as { page?: number; search?: string; technician?: number };
      const { data, error } = await api.GET("/api/service-orders/", {
        params: { query },
      });
      if (error || !data) throw new Error("No se pudieron cargar las órdenes.");
      return (data as unknown as Paginated<ServiceOrder>).results;
    },
  });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: ["order", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/service-orders/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar la orden.");
      return data as ServiceOrder;
    },
  });
}

export type OrderAction =
  | "start-diagnostic"
  | "approve"
  | "start-work"
  | "finish"
  | "deliver";

function invalidateOrder(qc: ReturnType<typeof useQueryClient>, id?: number) {
  void qc.invalidateQueries({ queryKey: ["order", id] });
  void qc.invalidateQueries({ queryKey: ["my-orders"] });
}

export function useAddPart(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { product: number; quantity: string }) => {
      const { error } = await api.POST("/api/service-orders/{id}/add-part/", {
        params: { path: { id: orderId as number } },
        body: input as unknown as ServiceOrder,
      });
      if (error) throw new Error("No se pudo agregar la pieza.");
    },
    onSuccess: () => invalidateOrder(qc, orderId),
  });
}

export function useReserveParts(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        "/api/service-orders/{id}/reserve-parts/",
        { params: { path: { id: orderId as number } }, body: {} as unknown as ServiceOrder },
      );
      if (error) throw new Error("No se pudieron reservar las piezas.");
      return data as unknown as { reserved: number[]; pending: number[] };
    },
    onSuccess: () => invalidateOrder(qc, orderId),
  });
}

export function useDeletePart(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partId: number) => {
      const { error } = await api.DELETE("/api/service-order-parts/{id}/", {
        params: { path: { id: partId } },
      });
      if (error) throw new Error("No se pudo quitar la pieza.");
    },
    onSuccess: () => invalidateOrder(qc, orderId),
  });
}

export interface NewOrderInput {
  customer: number;
  equipment?: number | null;
  service_type: string;
  customer_complaint?: string;
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewOrderInput) => {
      const { data, error } = await api.POST("/api/service-orders/", {
        body: input as unknown as ServiceOrder,
      });
      if (error || !data) throw new Error("No se pudo crear la orden.");
      return data as ServiceOrder;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my-orders"] }),
  });
}

export function useGenerateDoc(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: "quote" | "invoice") => {
      const params = { path: { id: orderId as number } };
      const empty = {} as unknown as ServiceOrder;
      const { data, error } =
        kind === "quote"
          ? await api.POST("/api/service-orders/{id}/generate-quote/", { params, body: empty })
          : await api.POST("/api/service-orders/{id}/generate-invoice/", { params, body: empty });
      if (error || !data) throw new Error("No se pudo generar el documento.");
      return data;
    },
    onSuccess: () => invalidateOrder(qc, orderId),
  });
}

export function useCancelOrder(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/service-orders/{id}/cancel/", {
        params: { path: { id: orderId as number } },
        body: {} as unknown as ServiceOrder,
      });
      if (error) throw new Error("No se pudo cancelar la orden.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my-orders"] }),
  });
}

export function useOrderAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: OrderAction) => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as ServiceOrder;
      const calls: Record<OrderAction, () => ReturnType<typeof api.POST>> = {
        "start-diagnostic": () =>
          api.POST("/api/service-orders/{id}/start-diagnostic/", { params, body: empty }),
        approve: () =>
          api.POST("/api/service-orders/{id}/approve/", { params, body: empty }),
        "start-work": () =>
          api.POST("/api/service-orders/{id}/start-work/", { params, body: empty }),
        finish: () =>
          api.POST("/api/service-orders/{id}/finish/", { params, body: empty }),
        deliver: () =>
          api.POST("/api/service-orders/{id}/deliver/", { params, body: empty }),
      };
      const { error } = await calls[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["order", id] });
      void qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
  });
}
