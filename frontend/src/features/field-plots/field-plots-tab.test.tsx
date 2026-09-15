import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldPlotsTab } from "./FieldPlotsTab";

const role = { current: "general_admin" };

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: role.current } }) }));
vi.mock("./api", () => ({
  useFieldPlots: () => ({
    data: [
      {
        id: 1,
        name: "Potrero 1",
        hectares: "15.0000",
        crop: "rice",
        crop_display: "Arroz",
        crop_other: "",
        location: "Entrada norte",
        water_per_hectare: "20.00",
        products: [{ id: 1, name: "Glifosato", dose_per_hectare: "10.0000", unit: "L/ha" }],
      },
    ],
    isLoading: false,
  }),
  useDeleteFieldPlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./FieldPlotFormModal", () => ({ FieldPlotFormModal: () => null }));

function renderTab() {
  return render(
    <MantineProvider>
      <FieldPlotsTab customerId={1} />
    </MantineProvider>,
  );
}

describe("FieldPlotsTab", () => {
  it("lista los lotes del cliente", () => {
    role.current = "general_admin";
    renderTab();
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("Entrada norte")).toBeInTheDocument();
    expect(screen.getByText("Arroz")).toBeInTheDocument();
  });

  it("muestra el botón de alta a quien puede escribir", () => {
    role.current = "piloto";
    renderTab();
    expect(screen.getByRole("button", { name: /nuevo lote/i })).toBeInTheDocument();
  });

  it("oculta las acciones a un rol de solo lectura", () => {
    role.current = "readonly";
    renderTab();
    expect(screen.queryByRole("button", { name: /nuevo lote/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/editar lote/i)).not.toBeInTheDocument();
  });
});
