import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type FieldJob = components["schemas"]["FieldJob"];

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  fumigation: "Fumigación",
  spreading: "Esparcido / abono",
};

export const FJ_STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  done: "Hecho",
  invoiced: "Facturado",
  cancelled: "Cancelado",
};

export const FJ_STATUS_COLOR: Record<string, string> = {
  scheduled: "#3b82f6",
  done: "#14b8a6",
  invoiced: "#9333ea",
  cancelled: "#ef4444",
};

export const PRODUCT_UNIT_OPTIONS = [
  { value: "L/ha", label: "L/ha" },
  { value: "cc/ha", label: "cc/ha" },
  { value: "kg/ha", label: "kg/ha" },
  { value: "g/ha", label: "g/ha" },
];

export interface SprayMixProduct {
  name: string;
  dose_per_hectare: number;
  unit: string;
}

export interface SprayCalcPrefill {
  hectares?: number;
  caldo_per_hectare?: number;
  tank_volume_liters?: number;
  products?: SprayMixProduct[];
}

export interface SprayMixResultRow {
  name: string;
  quantity: number;
  unit: string;
}

export interface SprayMixResult {
  total_caldo_liters: number;
  liquid_chemical_liters: number;
  water_liters: number;
  tanks_needed: number;
  full_tanks: number;
  last_tank_liters: number;
  products_total: SprayMixResultRow[];
  per_full_tank: SprayMixResultRow[];
  water_per_full_tank: number;
  last_tank: SprayMixResultRow[];
  water_last_tank: number;
}

export interface Company {
  fumigation_price_per_hectare?: string;
  spreading_price_per_quintal?: string;
  drone_tank_volume_liters?: string;
  default_water_per_hectare?: string;
}

export function useCompany() {
  return useQuery({
    queryKey: ["company"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/company/");
      if (error || !data) return {} as Company;
      return data as unknown as Company;
    },
  });
}

export function useFieldJobs(all: boolean, technicianId: number | undefined) {
  return useQuery({
    queryKey: ["field-jobs", all, technicianId],
    queryFn: async () => {
      const query = {
        technician: all ? undefined : technicianId,
      } as { page?: number; technician?: number };
      const { data, error } = await api.GET("/api/field-jobs/", { params: { query } });
      if (error || !data) throw new Error("No se pudieron cargar los trabajos.");
      return (data as unknown as Paginated<FieldJob>).results;
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

export interface FieldJobInput {
  job_type: string;
  customer: number;
  equipment?: number | null;
  technician?: number | null;
  scheduled_date?: string;
  location?: string;
  crop?: string;
  products?: { name: string; dose_per_hectare: string; unit: string }[];
  hectares?: string;
  quintals?: string;
  unit_price?: string;
  notes?: string;
  latitude?: string | null;
  longitude?: string | null;
}

export function useSaveFieldJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FieldJobInput & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/field-jobs/{id}/", {
          params: { path: { id } },
          body: body as unknown as FieldJob,
        });
        if (error || !data) throw new Error("No se pudo guardar el trabajo.");
        return data as FieldJob;
      }
      const { data, error } = await api.POST("/api/field-jobs/", {
        body: body as unknown as FieldJob,
      });
      if (error || !data) throw new Error("No se pudo crear el trabajo.");
      return data as FieldJob;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-jobs"] }),
  });
}

export type FJAction = "mark-done" | "cancel" | "generate-invoice";

export function useFieldJobAction(id: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: FJAction) => {
      const params = { path: { id: id as number } };
      const empty = {} as unknown as FieldJob;
      const calls: Record<FJAction, () => ReturnType<typeof api.POST>> = {
        "mark-done": () => api.POST("/api/field-jobs/{id}/mark-done/", { params, body: empty }),
        cancel: () => api.POST("/api/field-jobs/{id}/cancel/", { params, body: empty }),
        "generate-invoice": () =>
          api.POST("/api/field-jobs/{id}/generate-invoice/", { params, body: empty }),
      };
      const { data, error } = await calls[action]();
      if (error) throw new Error("No se pudo ejecutar la acción.");
      return data as { invoice_number?: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-job", id] });
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
    },
  });
}

export function useCalculateMix() {
  return useMutation({
    mutationFn: async (input: {
      hectares: number;
      caldo_per_hectare: number;
      tank_volume_liters: number;
      products: SprayMixProduct[];
    }) => {
      const { data, error } = await api.POST("/api/field-jobs/calculate-mix/", {
        body: input as unknown as never,
      });
      if (error || !data) throw new Error("No se pudo calcular la mezcla.");
      return data as unknown as SprayMixResult;
    },
  });
}
