import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { FieldJob, SprayMixProduct, SprayMixResult } from "./types";

export interface FJListParams {
  search?: string;
  status?: string;
  job_type?: string;
  customer?: number;
  from?: string;
  to?: string;
  page?: number;
}

export function useFieldJobs(params: FJListParams) {
  return useQuery({
    queryKey: ["field-jobs", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-jobs/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            job_type: params.job_type || undefined,
            customer: params.customer,
            from: params.from || undefined,
            to: params.to || undefined,
            page: params.page,
          } as unknown as never,
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los trabajos.");
      return data as unknown as Paginated<FieldJob>;
    },
  });
}

export function useFieldJob(id: number | undefined) {
  return useQuery({
    queryKey: ["field-job", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-jobs/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el trabajo.");
      return data as FieldJob;
    },
  });
}

export function useSaveFieldJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FieldJob> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/field-jobs/{id}/", {
          params: { path: { id } },
          body: body as FieldJob,
        });
        if (error) throw new Error("No se pudo guardar el trabajo.");
        return data as FieldJob;
      }
      const { data, error } = await api.POST("/api/field-jobs/", {
        body: body as FieldJob,
      });
      if (error) throw new Error("No se pudo crear el trabajo.");
      return data as FieldJob;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
    },
  });
}

export function useDeleteFieldJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/field-jobs/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el trabajo.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-jobs"] }),
  });
}

type FJAction = "mark-done" | "cancel" | "generate-invoice";

export function useFieldJobAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: FJAction) => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as FieldJob;
      const calls: Record<FJAction, () => ReturnType<typeof api.POST>> = {
        "mark-done": () =>
          api.POST("/api/field-jobs/{id}/mark-done/", { params, body: empty }),
        cancel: () => api.POST("/api/field-jobs/{id}/cancel/", { params, body: empty }),
        "generate-invoice": () =>
          api.POST("/api/field-jobs/{id}/generate-invoice/", { params, body: empty }),
      };
      const { data, error } = await calls[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as { id: number; invoice_number?: string; status?: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-job", id] });
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
    },
  });
}

export interface CalculateMixInput {
  hectares: number;
  caldo_per_hectare: number;
  tank_volume_liters: number;
  products: SprayMixProduct[];
}

export function useCalculateMix() {
  return useMutation({
    mutationFn: async (input: CalculateMixInput) => {
      const { data, error } = await api.POST("/api/field-jobs/calculate-mix/", {
        body: input as unknown as never,
      });
      if (error || !data) throw new Error("No se pudo calcular la mezcla.");
      return data as unknown as SprayMixResult;
    },
  });
}
