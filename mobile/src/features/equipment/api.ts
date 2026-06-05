import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";
import { colors } from "../../theme";

export type Equipment = components["schemas"]["Equipment"];
export type EquipmentType = components["schemas"]["EquipmentType"];

export interface EquipmentInput {
  name: string;
  equipment_type: number | null;
  customer: number | null;
  owner_type: string;
  status: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  internal_code?: string;
  notes?: string;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

export function useEquipmentTypes() {
  return useQuery({
    queryKey: ["equipment-types"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/types/");
      if (error || !data) throw new Error("No se pudieron cargar los tipos.");
      return data as unknown as EquipmentType[];
    },
  });
}

export function useSaveEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: EquipmentInput }) => {
      if (id) {
        const { error } = await api.PATCH("/api/equipment/{id}/", {
          params: { path: { id } },
          body: input as unknown as Equipment,
        });
        if (error) throw new Error("No se pudo guardar el equipo.");
      } else {
        const { error } = await api.POST("/api/equipment/", {
          body: input as unknown as Equipment,
        });
        if (error) throw new Error("No se pudo crear el equipo.");
      }
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["equipment"] });
      if (vars.id) void qc.invalidateQueries({ queryKey: ["equipment-one", vars.id] });
    },
  });
}

export function useEquipmentList(search: string) {
  return useQuery({
    queryKey: ["equipment", search],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/", {
        params: { query: { search: search || undefined } as { search?: string } },
      });
      if (error || !data) throw new Error("No se pudieron cargar los equipos.");
      return (data as unknown as Paginated<Equipment>).results;
    },
  });
}

export function useEquipment(id: number | undefined) {
  return useQuery({
    queryKey: ["equipment-one", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/{id}/", {
        params: { path: { id: id as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el equipo.");
      return data as Equipment;
    },
  });
}

export const EQ_STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  in_repair: "En reparación",
  retired: "Retirado",
};
export const EQ_STATUS_COLOR: Record<string, string> = {
  active: colors.primary,
  in_repair: colors.warning,
  retired: colors.dimmed,
};
