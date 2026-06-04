import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type {
  DateRange,
  LowStockReport,
  ProfitReport,
  SalesReport,
  ServiceOrdersReport,
} from "./types";

function reportError(status?: number): Error {
  return new Error(status === 403 ? "forbidden" : "No se pudo cargar el reporte.");
}

export function useLowStockReport() {
  return useQuery({
    queryKey: ["report", "low-stock"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/low-stock/");
      if (error || !data) throw reportError(response?.status);
      return data as unknown as LowStockReport;
    },
  });
}

// Las vistas leen ?from=&to= aunque el OpenAPI no las declare (query tipado como never).
function rangeQuery(range: DateRange) {
  return { from: range.from || undefined, to: range.to || undefined } as unknown as never;
}

export function useServiceOrdersReport(range: DateRange) {
  return useQuery({
    queryKey: ["report", "service-orders", range],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/reports/service-orders/",
        { params: { query: rangeQuery(range) } },
      );
      if (error || !data) throw reportError(response?.status);
      return data as unknown as ServiceOrdersReport;
    },
  });
}

export function useSalesReport(range: DateRange) {
  return useQuery({
    queryKey: ["report", "sales", range],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/sales/", {
        params: { query: rangeQuery(range) },
      });
      if (error || !data) throw reportError(response?.status);
      return data as unknown as SalesReport;
    },
  });
}

export function useProfitReport(range: DateRange) {
  return useQuery({
    queryKey: ["report", "profit", range],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/profit/", {
        params: { query: rangeQuery(range) },
      });
      if (error || !data) throw reportError(response?.status);
      return data as unknown as ProfitReport;
    },
  });
}
