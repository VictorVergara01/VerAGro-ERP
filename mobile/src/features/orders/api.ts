import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type ServiceOrder = components["schemas"]["ServiceOrder"];

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
