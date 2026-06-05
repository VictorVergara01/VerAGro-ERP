import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";
import { colors } from "../../theme";

export type Equipment = components["schemas"]["Equipment"];

interface Paginated<T> {
  count: number;
  results: T[];
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
