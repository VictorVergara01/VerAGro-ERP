import { describe, expect, it } from "vitest";
import {
  canRegisterPayments,
  canWriteBilling,
} from "../auth/roles";

describe("permisos de facturación", () => {
  it("ventas factura pero no cobra", () => {
    expect(canWriteBilling("sales")).toBe(true);
    expect(canRegisterPayments("sales")).toBe(false);
  });
  it("contabilidad cobra pero no factura", () => {
    expect(canRegisterPayments("accounting")).toBe(true);
    expect(canWriteBilling("accounting")).toBe(false);
  });
  it("ambos admins pueden todo en billing", () => {
    for (const r of ["super_admin", "general_admin"]) {
      expect(canWriteBilling(r)).toBe(true);
      expect(canRegisterPayments(r)).toBe(true);
    }
  });
  it("consulta no puede nada", () => {
    expect(canWriteBilling("readonly")).toBe(false);
    expect(canRegisterPayments("readonly")).toBe(false);
  });
});
