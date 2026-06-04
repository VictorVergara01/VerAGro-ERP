import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { ServiceOrder } from "./types";

export interface SOListParams {
  search?: string;
  status?: string;
  customer?: number;
  page?: number;
}

export function useServiceOrders(params: SOListParams) {
  return useQuery({
    queryKey: ["service-orders", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/service-orders/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            customer: params.customer,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar las órdenes.");
      return data as unknown as Paginated<ServiceOrder>;
    },
  });
}

export function useServiceOrder(id: number | undefined) {
  return useQuery({
    queryKey: ["service-order", id],
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

export function useSaveServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServiceOrder> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/service-orders/{id}/", {
          params: { path: { id } },
          body: body as ServiceOrder,
        });
        if (error) throw new Error("No se pudo guardar la orden.");
        return data as ServiceOrder;
      }
      const { data, error } = await api.POST("/api/service-orders/", {
        body: body as ServiceOrder,
      });
      if (error) throw new Error("No se pudo crear la orden.");
      return data as ServiceOrder;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
  });
}

type SOAction =
  | "start-diagnostic"
  | "approve"
  | "start-work"
  | "finish"
  | "deliver"
  | "cancel";

function invalidate(qc: ReturnType<typeof useQueryClient>, id?: number) {
  void qc.invalidateQueries({ queryKey: ["service-order", id] });
  void qc.invalidateQueries({ queryKey: ["service-orders"] });
  void qc.invalidateQueries({ queryKey: ["products"] });
}

export function useServiceOrderAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: SOAction) => {
      const empty = {} as unknown as ServiceOrder;
      const params = { path: { id: id as number } };
      const calls: Record<SOAction, () => ReturnType<typeof api.POST>> = {
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
        cancel: () =>
          api.POST("/api/service-orders/{id}/cancel/", { params, body: empty }),
      };
      const { data, error } = await calls[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data;
    },
    onSuccess: () => invalidate(qc, id),
  });
}

export function useReserveParts(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        "/api/service-orders/{id}/reserve-parts/",
        { params: { path: { id: id as number } }, body: {} as unknown as ServiceOrder },
      );
      if (error) throw new Error("No se pudieron reservar las piezas.");
      return data as unknown as {
        reserved: number[];
        pending: number[];
        status: string;
      };
    },
    onSuccess: () => invalidate(qc, id),
  });
}

export interface AddPartInput {
  product: number;
  quantity: string;
  unit_cost?: string;
  unit_price?: string;
  notes?: string;
}

export function useAddPart(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddPartInput) => {
      const { data, error } = await api.POST(
        "/api/service-orders/{id}/add-part/",
        {
          params: { path: { id: id as number } },
          body: input as unknown as ServiceOrder,
        },
      );
      if (error) throw new Error("No se pudo agregar la pieza.");
      return data;
    },
    onSuccess: () => invalidate(qc, id),
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
    onSuccess: () => invalidate(qc, orderId),
  });
}

export function useGenerateDocument(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: "quote" | "invoice") => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as ServiceOrder;
      const { data, error } =
        kind === "quote"
          ? await api.POST("/api/service-orders/{id}/generate-quote/", {
              params,
              body: empty,
            })
          : await api.POST("/api/service-orders/{id}/generate-invoice/", {
              params,
              body: empty,
            });
      if (error) throw new Error("No se pudo generar el documento.");
      return data as { id: number; quote_number?: string; invoice_number?: string };
    },
    onSuccess: () => invalidate(qc, id),
  });
}
