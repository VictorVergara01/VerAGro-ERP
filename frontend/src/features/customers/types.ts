import type { Schemas } from "../../lib/api/types";

export type Customer = Schemas["Customer"];

export const CUSTOMER_TYPE_OPTIONS = [
  { value: "person", label: "Persona" },
  { value: "company", label: "Empresa" },
];

export const ID_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "cedula", label: "Cédula" },
  { value: "ruc", label: "RUC" },
  { value: "passport", label: "Pasaporte" },
  { value: "other", label: "Otro" },
];

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  person: "Persona",
  company: "Empresa",
};
