import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeRequest } from "../field-finance/api";

export interface Collection { id: number; amount: string; payment_date: string; method: string; reference: string; notes: string; recorded_by: string }
export interface FieldAccount {
  id: number; number: string; customer: number; customer_name: string; pilot: number | null; pilot_name: string;
  job_type: string; done_date: string; due_date: string | null; total: string | number; collected: string | number; balance_due: string | number;
  collection_status: "pending" | "partial" | "paid" | "overdue"; days_overdue: number;
  collections?: Collection[]; invoice?: { id: number; number: string; status: string } | null;
}
export interface AccountFilters { from?: string; to?: string; search?: string; collection_status?: string }
export interface AccountsResponse { items: FieldAccount[]; summary: { total: string | number; collected: string | number; balance_due: string | number; overdue: string | number } }
export const COLLECTION_STATUS = { pending: "Pendiente", partial: "Abonado", paid: "Pagado", overdue: "Vencido" };
export const COLLECTION_METHODS = [{ value: "cash", label: "Efectivo" }, { value: "bank_transfer", label: "Transferencia" }, { value: "yappy", label: "Yappy" }, { value: "ach", label: "ACH" }, { value: "card", label: "Tarjeta" }, { value: "other", label: "Otro" }];

export function useFieldAccounts(params: AccountFilters) {
  return useQuery({
    queryKey: ["field-accounts", params],
    queryFn: () => financeRequest<AccountsResponse>(`field-accounts/?${new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][])}`),
  });
}
export function useFieldAccount(id: number) {
  return useQuery({ queryKey: ["field-account", id], queryFn: () => financeRequest<FieldAccount>(`field-accounts/${id}/`) });
}
export function useSaveCollection(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: { action: "collect" | "terms"; body: unknown }) => financeRequest(`field-accounts/${id}/${action}/`, body),
    onSuccess: () => {
      for (const key of ["field-account", "field-accounts", "field-jobs", "field-job", "field-finance", "report", "invoice", "invoices"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
