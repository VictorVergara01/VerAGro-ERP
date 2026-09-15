import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { FieldPlot } from "./types";

export interface FieldPlotListParams {
  customer?: number;
  search?: string;
  includeInactive?: boolean;
}

/** La API de lotes no pagina: devuelve un array plano. */
export function useFieldPlots(params: FieldPlotListParams, enabled = true) {
  return useQuery({
    queryKey: ["field-plots", params],
    enabled,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-plots/", {
        params: {
          query: {
            customer: params.customer,
            search: params.search || undefined,
            include_inactive: params.includeInactive ? "true" : undefined,
          } as unknown as never,
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los lotes.");
      return data as unknown as FieldPlot[];
    },
  });
}

export function useSaveFieldPlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FieldPlot> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/field-plots/{id}/", {
          params: { path: { id } },
          body: body as FieldPlot,
        });
        if (error) throw new Error("No se pudo guardar el lote.");
        return data as FieldPlot;
      }
      const { data, error } = await api.POST("/api/field-plots/", {
        body: body as FieldPlot,
      });
      if (error) throw new Error("No se pudo crear el lote.");
      return data as FieldPlot;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-plots"] }),
  });
}

export function useDeleteFieldPlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/field-plots/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el lote.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-plots"] }),
  });
}
