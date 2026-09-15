import { describe, expect, it } from "vitest";

import { userErrorMessage } from "./errors";

describe("userErrorMessage", () => {
  it("devuelve el mensaje específico de un error de campo (p. ej. nombre duplicado)", () => {
    const error = { name: ["Ya existe un lote activo con ese nombre para este cliente."] };
    expect(userErrorMessage(error, "No se pudo crear el lote.")).toBe(
      "Ya existe un lote activo con ese nombre para este cliente.",
    );
  });

  it("prioriza detail cuando está presente", () => {
    const error = { detail: "No tiene permiso para esta acción." };
    expect(userErrorMessage(error, "Fallback")).toBe("No tiene permiso para esta acción.");
  });

  it("cae al mensaje por defecto si el cuerpo no tiene forma reconocible", () => {
    expect(userErrorMessage(undefined, "No se pudo guardar.")).toBe("No se pudo guardar.");
    expect(userErrorMessage({}, "No se pudo guardar.")).toBe("No se pudo guardar.");
    expect(userErrorMessage({ field: [] }, "No se pudo guardar.")).toBe("No se pudo guardar.");
  });
});
