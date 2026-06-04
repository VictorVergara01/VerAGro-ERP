import type { Schemas } from "../../lib/api/types";

export type Equipment = Schemas["Equipment"];
export type EquipmentType = Schemas["EquipmentType"];

export const OWNER_TYPE_OPTIONS = [
  { value: "customer", label: "Cliente" },
  { value: "company", label: "Empresa" },
];

export const STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "in_maintenance", label: "En mantenimiento" },
  { value: "out_of_service", label: "Fuera de servicio" },
  { value: "sold", label: "Vendido" },
  { value: "retired", label: "Retirado" },
];

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export const STATUS_COLOR: Record<string, string> = {
  active: "green",
  in_maintenance: "yellow",
  out_of_service: "orange",
  sold: "blue",
  retired: "gray",
};
