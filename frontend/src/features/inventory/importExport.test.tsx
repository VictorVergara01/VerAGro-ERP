import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportSummary } from "./ImportSummary";

function renderSummary(result: Parameters<typeof ImportSummary>[0]["result"]) {
  return render(
    <MantineProvider>
      <ImportSummary result={result} />
    </MantineProvider>,
  );
}

describe("ImportSummary", () => {
  it("muestra creados, saltados y la tabla de errores", () => {
    renderSummary({
      creados: 3,
      saltados: 1,
      errores: [{ fila: 4, sku: "X-1", motivo: "El nombre es obligatorio." }],
    });
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("X-1")).toBeInTheDocument();
  });

  it("sin errores no muestra la tabla", () => {
    renderSummary({ creados: 2, saltados: 0, errores: [] });
    expect(screen.queryByText(/Motivo/i)).not.toBeInTheDocument();
  });
});
