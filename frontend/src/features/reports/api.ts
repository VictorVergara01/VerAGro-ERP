import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type {
  BelowFloorReport,
  DateRange,
  FieldJobsReport,
  ReportSegment,
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
function rangeQuery(range: DateRange, segment?: ReportSegment) {
  return { from: range.from || undefined, to: range.to || undefined, segment } as unknown as never;
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

export function useSalesReport(range: DateRange, segment: ReportSegment = "workshop") {
  return useQuery({
    queryKey: ["report", "sales", segment, range],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/sales/", {
        params: { query: rangeQuery(range, segment) },
      });
      if (error || !data) throw reportError(response?.status);
      return data as unknown as SalesReport;
    },
  });
}

export function useBelowFloorSalesReport(range: DateRange) {
  return useQuery({
    queryKey: ["report", "below-floor-sales", range],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/reports/below-floor-sales/",
        { params: { query: rangeQuery(range) } },
      );
      if (error || !data) throw reportError(response?.status);
      return data as unknown as BelowFloorReport;
    },
  });
}

export function useProfitReport(range: DateRange, segment: ReportSegment = "workshop") {
  return useQuery({
    queryKey: ["report", "profit", segment, range],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/profit/", {
        params: { query: rangeQuery(range, segment) },
      });
      if (error || !data) throw reportError(response?.status);
      return data as unknown as ProfitReport;
    },
  });
}

export function useFieldJobsReport(range: DateRange) {
  return useQuery({
    queryKey: ["report", "field-jobs", range],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/api/reports/field-jobs/", {
        params: { query: rangeQuery(range) },
      });
      if (error || !data) throw reportError(response?.status);
      return data as unknown as FieldJobsReport;
    },
  });
}
