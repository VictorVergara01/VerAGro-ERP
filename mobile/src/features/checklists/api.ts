import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type ServiceChecklist = components["schemas"]["ServiceChecklist"];
export type ServiceChecklistItem = components["schemas"]["ServiceChecklistItem"];
export type ChecklistTemplate = components["schemas"]["ChecklistTemplate"];

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const ITEM_STATUS = [
  { value: "pending", label: "Pend." },
  { value: "ok", label: "OK" },
  { value: "fail", label: "Falla" },
  { value: "requires_replacement", label: "Reemplazo" },
  { value: "not_applicable", label: "N/A" },
];

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ["checklist-templates"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/checklists/templates/");
      if (error || !data) throw new Error("No se pudieron cargar las plantillas.");
      return (data as unknown as Paginated<ChecklistTemplate>).results;
    },
  });
}

export function useOrderChecklists(orderId: number | undefined) {
  return useQuery({
    queryKey: ["order-checklists", orderId],
    enabled: orderId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/service-orders/{id}/checklist/", {
        params: { path: { id: orderId as number } },
      });
      if (error || !data) throw new Error("No se pudo cargar el checklist.");
      return data as unknown as ServiceChecklist[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orderId?: number) {
  void qc.invalidateQueries({ queryKey: ["order-checklists", orderId] });
  void qc.invalidateQueries({ queryKey: ["order", orderId] });
}

export function useInstantiateChecklist(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: number) => {
      const { error } = await api.POST("/api/service-orders/{id}/checklist/", {
        params: { path: { id: orderId as number } },
        body: { checklist_template: templateId } as unknown as never,
      });
      if (error) throw new Error("No se pudo crear el checklist.");
    },
    onSuccess: () => invalidate(qc, orderId),
  });
}

export interface FillItem {
  id: number;
  status: string;
}

export function useFillChecklist(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { checklistId: number; items: FillItem[] }) => {
      const { error } = await api.POST("/api/service-checklists/{id}/fill/", {
        params: { path: { id: args.checklistId } },
        body: { items: args.items } as unknown as ServiceChecklist,
      });
      if (error) throw new Error("No se pudo guardar el checklist.");
    },
    onSuccess: () => invalidate(qc, orderId),
  });
}

export function useCompleteChecklist(orderId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (checklistId: number) => {
      const { error } = await api.POST("/api/service-checklists/{id}/complete/", {
        params: { path: { id: checklistId } },
        body: {} as unknown as ServiceChecklist,
      });
      if (error) throw new Error("No se pudo completar el checklist.");
    },
    onSuccess: () => invalidate(qc, orderId),
  });
}
