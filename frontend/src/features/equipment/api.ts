import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { Paginated } from "../../lib/api/types";
import type { Equipment, EquipmentType } from "./types";

export interface EquipmentListParams {
  search?: string;
  status?: string;
  customer?: number;
  equipmentType?: number;
  page?: number;
}

export function useEquipmentList(params: EquipmentListParams) {
  return useQuery({
    queryKey: ["equipment", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/", {
        params: {
          query: {
            search: params.search || undefined,
            status: params.status || undefined,
            customer: params.customer,
            equipment_type: params.equipmentType,
            page: params.page,
          },
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los equipos.");
      return data as unknown as Paginated<Equipment>;
    },
  });
}

export function useEquipment(id: number | undefined) {
  return useQuery({
    queryKey: ["equipment-item", id],
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

export function useEquipmentTypes() {
  return useQuery({
    queryKey: ["equipment-types"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/types/");
      if (error || !data) throw new Error("No se pudieron cargar los tipos.");
      return data as unknown as EquipmentType[];
    },
  });
}

export interface EquipmentServiceSummary {
  id: number;
  service_order_number: string;
  status: string;
  service_type: string;
  received_date: string | null;
  finished_date: string | null;
  total_amount: string;
}

export function useEquipmentServiceHistory(id: number | undefined) {
  return useQuery({
    queryKey: ["equipment-item", id, "service-history"],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/equipment/{id}/service-history/",
        { params: { path: { id: id as number } } },
      );
      if (error) throw new Error("No se pudo cargar el historial.");
      return (data as unknown as Paginated<EquipmentServiceSummary>).results;
    },
  });
}

export function useSaveEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Equipment> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/equipment/{id}/", {
          params: { path: { id } },
          body: body as Equipment,
        });
        if (error) throw new Error("No se pudo guardar el equipo.");
        return data as Equipment;
      }
      const { data, error } = await api.POST("/api/equipment/", {
        body: body as Equipment,
      });
      if (error) throw new Error("No se pudo crear el equipo.");
      return data as Equipment;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipment"] });
    },
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/equipment/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo retirar el equipo.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipment"] });
    },
  });
}
