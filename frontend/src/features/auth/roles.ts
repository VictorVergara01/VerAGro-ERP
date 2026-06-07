export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrador",
  general_admin: "Administrador General",
  sales: "Facturación / Ventas",
  technician: "Técnico",
  inventory: "Inventario",
  accounting: "Contabilidad",
  readonly: "Consulta",
};

export const isSuperAdmin = (r?: string) => r === "super_admin";
export const isAdmin = (r?: string) => r === "super_admin" || r === "general_admin";
export const canWriteBilling = (r?: string) => isAdmin(r) || r === "sales";
export const canRegisterPayments = (r?: string) => isAdmin(r) || r === "accounting";
export const canWriteInventory = (r?: string) => isAdmin(r) || r === "inventory";
export const canWriteService = (r?: string) => isAdmin(r) || r === "technician";
export const canWriteCustomers = (r?: string) =>
  isAdmin(r) || r === "sales" || r === "technician" || r === "inventory";
export const canWriteEquipment = (r?: string) =>
  isAdmin(r) || r === "technician" || r === "sales" || r === "inventory";

export const FINANCIAL_ROLES = ["super_admin", "general_admin", "sales", "accounting"];
