// Los endpoints de reportes devuelven objetos libres (no tipados en el OpenAPI).
// Tipos locales que reflejan la forma del backend (apps.reports.views).

export interface LowStockReport {
  summary: { total_products: number; total_stock_value: number | string };
  low_stock: {
    id: number;
    sku: string;
    name: string;
    stock_quantity: string;
    reserved_quantity: string;
    minimum_stock: string;
    available_quantity: string;
  }[];
}

export interface ServiceOrdersReport {
  by_status: Record<string, number>;
  pending: number;
  waiting_parts: number;
  finished_by_technician: {
    technician: number | null;
    technician__full_name: string | null;
    count: number;
  }[];
  most_used_parts: {
    product: number;
    product__sku: string;
    product__name: string;
    total_quantity: string;
  }[];
  top_customers: { customer__name: string; count: number }[];
  top_failing_equipment: { equipment__name: string; count: number }[];
}

export interface SalesReport {
  sales_by_month: { month: string; total: number | string; count: number }[];
  pending_invoices: {
    invoice_number: string;
    customer__name: string;
    total: string;
    balance_due: string;
    status: string;
  }[];
}

export interface ProfitReport {
  by_invoice: {
    invoice_number: string;
    revenue: number | string;
    cost: number | string;
    margin: number | string;
  }[];
  by_part: {
    product__sku: string;
    product__name: string;
    total_quantity: string;
    total_margin: number | string;
  }[];
  totals: { revenue: number | string; cost: number | string; margin: number | string };
}

export interface DateRange {
  from?: string;
  to?: string;
}
