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
  top_customers: { customer__name: string; count: number }[];
  top_failing_equipment: { equipment__name: string; count: number }[];
  purchases_by_supplier: { supplier__name: string; total: number; count: number }[];
}

const OPEN_STATUSES = [
  "received",
  "in_diagnostic",
  "quoted",
  "approved",
  "in_progress",
];

export function sumStatuses(
  byStatus: Record<string, number>,
  statuses: string[],
): number {
  return statuses.reduce((acc, s) => acc + (byStatus[s] ?? 0), 0);
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/dashboard/");
      if (error || !data) {
        const status = response?.status;
        throw new Error(
          status === 403
            ? "forbidden"
            : "No se pudo cargar el dashboard.",
        );
      }
      return data as unknown as DashboardData;
    },
  });
}

export { OPEN_STATUSES };
