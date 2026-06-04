import type { Schemas } from "../../lib/api/types";

export type Supplier = Schemas["Supplier"];
export type SupplierProduct = Schemas["SupplierProduct"];

export interface PurchaseHistoryItem {
  id: number;
  order_number: string;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  currency: string;
  grand_total: string;
}
