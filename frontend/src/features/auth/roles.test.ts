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

  it("canWriteCustomers sigue concediendo acceso a roles preexistentes", () => {
    expect(canWriteCustomers("sales")).toBe(true);
    expect(canWriteCustomers("technician")).toBe(true);
    expect(canWriteCustomers("inventory")).toBe(true);
    expect(canWriteCustomers("general_admin")).toBe(true);
  });

  it("canWriteFieldJobs cubre roles no-piloto que también pueden escribir", () => {
    expect(canWriteFieldJobs("technician")).toBe(true);
    expect(canWriteFieldJobs("sales")).toBe(true);
    expect(canWriteFieldJobs("general_admin")).toBe(true);
    expect(canWriteFieldJobs("readonly")).toBe(false);
  });

  it("solo ve Dashboard, Trabajos de campo y Clientes en la navegación", () => {
    expect(canSeeNav("piloto", "/")).toBe(true);
    expect(canSeeNav("piloto", "/field-jobs")).toBe(true);
    expect(canSeeNav("piloto", "/customers")).toBe(true);
    expect(canSeeNav("piloto", "/service-orders")).toBe(false);
    expect(canSeeNav("piloto", "/equipment")).toBe(false);
    expect(canSeeNav("piloto", "/inventory")).toBe(false);
    expect(canSeeNav("piloto", "/suppliers")).toBe(false);
    expect(canSeeNav("piloto", "/purchasing")).toBe(false);
    expect(canSeeNav("piloto", "/quotes")).toBe(false);
    expect(canSeeNav("piloto", "/invoices")).toBe(false);
    expect(canSeeNav("piloto", "/reports")).toBe(false);
    expect(canSeeNav("piloto", "/settings")).toBe(false);
  });

  it("otros roles ven toda la navegación", () => {
    expect(canSeeNav("general_admin", "/settings")).toBe(true);
    expect(canSeeNav("technician", "/inventory")).toBe(true);
  });
});
