import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../../lib/api/client";
import { userErrorMessage } from "../../lib/api/errors";

export interface FieldPilot { id: number; name: string; phone: string; is_active: boolean }
export interface PilotRate { id: number; pilot: number; pilot_name: string; rate_per_hectare: string }
export interface Assistant { id: number; name: string; is_active: boolean }
export interface Earning { id: number; job: number; job_number: string; customer_name: string; pilot: number; pilot_name: string; earned_date: string; hectares: string; rate_per_hectare: string; amount: string; payment: number | null; actuals_from_legacy: boolean }
export interface Day { id: number; assistant: number; assistant_name: string; date: string; end_time: string; overtime_minutes: number; amount: string; payment: number | null; notes: string }
export interface Expense { id: number; date: string; category: string; description: string; payee: string; amount: string; equipment: number | null; receipt_reference: string; payment_date: string | null; payment_method: string; payment_reference: string }
export interface Payment { id: number; kind: "pilot" | "assistant"; beneficiary: string; amount: string; payment_date: string; method: string; reference: string; notes: string; pilot_earnings: Earning[]; assistant_days: Day[] }
export interface FinanceSummary {
  revenue: string | number; pilot_cost: string | number; assistant_cost: string | number; general_cost: string | number;
  total_cost: string | number; operating_result: string | number; paid_in_period: string | number; pending_cost: string | number; receivable: string | number;
  collected_in_period: string | number;
  cash_flow_in_period: string | number;
  unpriced_jobs: { id: number; number: string; pilot_id: number | null; pilot__name: string | null; actual_hectares: string | null; done_date: string | null }[];
  expenses_by_category: { category: string; total: string | number }[];
  by_customer: FieldPerformance[]; by_pilot: FieldPerformance[]; by_month: FieldPerformance[];
  unlinked_invoice_count: number;
}
export interface FieldPerformance {
  id: number | string | null; name: string; count: number; hectares: number | string; quintals: number | string;
  revenue: number | string; collected: number | string; balance_due: number | string; pilot_cost: number | string;
  margin_before_general_costs: number | string; unpriced_count: number;
}

export async function financeRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await authedFetch(`/api/${path}`, body === undefined ? undefined : {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new Error(userErrorMessage(data, "No se pudo completar la operación."));
  return data as T;
}

export function useFieldFinance() {
  return useQuery({
    queryKey: ["field-finance"],
    queryFn: async () => {
      const [rates, assistants, earnings, days, expenses, payments, pilots, summary] = await Promise.all([
        financeRequest<PilotRate[]>("field-pilot-rates/"), financeRequest<Assistant[]>("field-assistants/"),
        financeRequest<Earning[]>("field-pilot-earnings/"), financeRequest<Day[]>("field-assistant-days/"),
        financeRequest<Expense[]>("field-expenses/"), financeRequest<Payment[]>("field-payments/"),
        financeRequest<FieldPilot[]>("field-pilots/"),
        financeRequest<FinanceSummary>("reports/field-finance/"),
      ]);
      return { rates, assistants, earnings, days, expenses, payments, pilots, summary };
    },
  });
}

export function useFinanceSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: unknown; method?: string }) => financeRequest(path, body, method),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["field-finance"] });
      void qc.invalidateQueries({ queryKey: ["report"] });
      void qc.invalidateQueries({ queryKey: ["field-jobs"] });
      void qc.invalidateQueries({ queryKey: ["field-pilots"] });
    },
  });
}

export function usePilots() {
  return useQuery({
    queryKey: ["field-pilots"],
    queryFn: () => financeRequest<FieldPilot[]>("field-pilots/"),
  });
}

export function useFieldFinanceReport(range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["report", "field-finance", range],
    queryFn: () => financeRequest<FinanceSummary>(`reports/field-finance/?${new URLSearchParams({ from: range.from || "", to: range.to || "" })}`),
  });
}
