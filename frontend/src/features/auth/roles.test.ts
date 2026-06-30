import { describe, expect, it } from "vitest";

import {
  ROLE_LABELS,
  isPiloto,
  canWriteFieldJobs,
  canWriteCustomers,
  canSeeNav,
} from "./roles";

describe("rol piloto", () => {
  it("tiene etiqueta", () => {
    expect(ROLE_LABELS.piloto).toBe("Piloto");
  });

  it("isPiloto detecta el rol", () => {
    expect(isPiloto("piloto")).toBe(true);
    expect(isPiloto("technician")).toBe(false);
  });

  it("puede escribir trabajos de campo y clientes", () => {
    expect(canWriteFieldJobs("piloto")).toBe(true);
    expect(canWriteCustomers("piloto")).toBe(true);
  });

  it("solo ve Dashboard, Trabajos de campo y Clientes en la navegación", () => {
    expect(canSeeNav("piloto", "/")).toBe(true);
    expect(canSeeNav("piloto", "/field-jobs")).toBe(true);
    expect(canSeeNav("piloto", "/customers")).toBe(true);
    expect(canSeeNav("piloto", "/service-orders")).toBe(false);
    expect(canSeeNav("piloto", "/inventory")).toBe(false);
    expect(canSeeNav("piloto", "/invoices")).toBe(false);
    expect(canSeeNav("piloto", "/settings")).toBe(false);
  });

  it("otros roles ven toda la navegación", () => {
    expect(canSeeNav("general_admin", "/settings")).toBe(true);
    expect(canSeeNav("technician", "/inventory")).toBe(true);
  });
});
