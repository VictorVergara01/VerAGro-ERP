import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompatibleProductsPanel } from "./CompatibleProductsPanel";
import type { CompatibleProductsResponse } from "../despieceTypes";

const data: CompatibleProductsResponse = {
  equipment_model: { id: 1, name: "DJI Agras T50" },
  component: { id: 3, name: "Motor M1", path: "Propulsión > Brazo M1 > Motor M1" },
  products: [
    { id: 10, sku: "DJI-T50-MOTOR-CW", name: "Motor CW", part_number: "YC.JG.MY001043", stock_quantity: "4.00",
      reserved_quantity: "0.00", available_quantity: "4.00", sale_price: "450.00",
      location: "A-03", is_primary: true },
    { id: 11, sku: "DJI-T50-MOTOR-CCW", name: "Motor CCW", part_number: "", stock_quantity: "0.00",
      reserved_quantity: "0.00", available_quantity: "0.00", sale_price: "450.00",
      location: "A-04", is_primary: false },
  ],
};

function renderPanel(disabled = false) {
  const onAdd = vi.fn();
  render(
    <MantineProvider>
      <CompatibleProductsPanel data={data} isLoading={false} disabled={disabled} onAdd={onAdd} />
    </MantineProvider>,
  );
  return onAdd;
}

describe("CompatibleProductsPanel", () => {
  it("muestra la ruta y las piezas con estado de stock", () => {
    renderPanel();
    expect(screen.getByText(/Propulsión > Brazo M1 > Motor M1/)).toBeInTheDocument();
    expect(screen.getByText("DJI-T50-MOTOR-CW")).toBeInTheDocument();
    expect(screen.getByText("Sin existencia")).toBeInTheDocument(); // el CCW disp 0
    expect(screen.getByText("Principal")).toBeInTheDocument();
  });

  it("agrega la pieza disponible a la orden", () => {
    const onAdd = renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Agregar a la orden/i })[0]);
    expect(onAdd).toHaveBeenCalledWith(10, expect.any(Number));
  });

  it("deshabilita agregar cuando la orden es terminal", () => {
    renderPanel(true);
    screen.getAllByRole("button", { name: /Agregar a la orden/i }).forEach((b) =>
      expect(b).toBeDisabled(),
    );
  });
});
