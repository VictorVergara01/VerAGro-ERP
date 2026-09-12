import type { Schemas } from "../../lib/api/types";

export type Product = Schemas["Product"];
export type ProductCategory = Schemas["ProductCategory"];

// El endpoint de movimientos no declara serializer en el schema; tipo local
// que refleja InventoryMovementSerializer del backend.
export interface InventoryMovement {
  id: number;
  product: number;
  movement_type: string;
  quantity: string;
  unit_cost: string;
  reference_type: string;
  reference_id: number | null;
  notes: string;
  created_by: number | null;
  created_at: string;
}

// El endpoint de historial de costos tampoco declara serializer en el schema;
// tipo local que refleja CostHistoryEntrySerializer del backend. Los campos
// del desglose de compra vienen en null (no {}) cuando la entrada es un ajuste.
export type CostHistoryEntry = {
  id: number;
  created_at: string;
  movement_type: string;
  quantity: string;
  unit_cost: string;
  average_cost_after: string;
  purchase_order_number: string | null;
  supplier_name: string | null;
  supplier_unit_cost: string | null;
  allocated_extra_per_unit: string | null;
  notes: string;
};

export const MOVEMENT_LABEL: Record<string, string> = {
  purchase_in: "Entrada por compra",
  service_out: "Salida por servicio",
  sale_out: "Salida por venta",
  reservation: "Reserva",
  reservation_release: "Liberación de reserva",
  adjustment_in: "Ajuste +",
  adjustment_out: "Ajuste −",
  return_in: "Devolución",
  damaged_out: "Baja por daño",
};

export const MOVEMENT_COLOR: Record<string, string> = {
  purchase_in: "green",
  return_in: "green",
  adjustment_in: "teal",
  service_out: "orange",
  sale_out: "blue",
  damaged_out: "red",
  adjustment_out: "red",
  reservation: "grape",
  reservation_release: "gray",
};
