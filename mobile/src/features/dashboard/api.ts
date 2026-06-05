import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";

export interface DashboardData {
  inventory: {
    total_products: number;
    total_stock_value: number;
    low_stock_count: number;
  };
  service_orders_by_status: Record<string, number>;
  invoices: {
    pending_count: number;
    pending_amount: number;
    sales_this_month: number;
  };
}

export const OPEN_STATUSES = [
  "received",
  "in_diagnostic",
  "quoted",
  "approved",
  "in_progress",
];

export function sumStatuses(by: Record<string, number>, statuses: string[]): number {
  return statuses.reduce((acc, s) => acc + (by[s] ?? 0), 0);
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/dashboard/");
      const status = (response as unknown as { status?: number } | undefined)?.status;
      if (error || !data) {
        throw new Error(status === 403 ? "forbidden" : "No se pudo cargar el dashboard.");
      }
      return data as unknown as DashboardData;
    },
  });
}
