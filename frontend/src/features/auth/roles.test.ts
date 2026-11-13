import { describe, expect, it } from "vitest";
import { ROLE_LABELS, canWriteFieldJobs, canWriteCustomers, canSeeNav } from "./roles";

describe("personal de campo separado de usuarios", () => {
  it("no ofrece piloto como rol de acceso", () => {
    expect(ROLE_LABELS.piloto).toBeUndefined();
    expect(canWriteFieldJobs("piloto")).toBe(false);
    expect(canWriteCustomers("piloto")).toBe(false);
    expect(canSeeNav("piloto", "/field-jobs")).toBe(false);
  });
  it("conserva los permisos de administración, técnicos y ventas", () => {
    for (const role of ["general_admin", "technician", "sales"]) {
      expect(canWriteFieldJobs(role)).toBe(true);
      expect(canWriteCustomers(role)).toBe(true);
    }
    expect(canWriteFieldJobs("readonly")).toBe(false);
    expect(canSeeNav("technician", "/field-finance")).toBe(false);
    expect(canSeeNav("accounting", "/field-finance")).toBe(true);
  });
});
