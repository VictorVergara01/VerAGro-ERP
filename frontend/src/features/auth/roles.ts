export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrador",
  general_admin: "Administrador General",
  sales: "Facturación / Ventas",
  technician: "Técnico",
  piloto: "Piloto",
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
  isAdmin(r) || r === "sales" || r === "technician" || r === "inventory" || r === "piloto";
export const canWriteEquipment = (r?: string) =>
  isAdmin(r) || r === "technician" || r === "sales" || r === "inventory";

export const FINANCIAL_ROLES = ["super_admin", "general_admin", "sales", "accounting"];

export const isPiloto = (r?: string) => r === "piloto";
export const canWriteFieldJobs = (r?: string) =>
  isAdmin(r) || r === "technician" || r === "sales" || r === "piloto";

// Rutas que un piloto NO ve en la navegación (solo campo + clientes + dashboard).
const PILOTO_HIDDEN = new Set([
  "/service-orders",
  "/equipment",
  "/inventory",
  "/suppliers",
  "/purchasing",
  "/quotes",
  "/invoices",
  "/reports",
  "/settings",
]);

export const canSeeNav = (role: string | undefined, to: string) =>
  role === "piloto" ? !PILOTO_HIDDEN.has(to) : true;
