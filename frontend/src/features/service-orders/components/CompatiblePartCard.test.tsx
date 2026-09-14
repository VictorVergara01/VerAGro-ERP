import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CompatibleProduct } from "../despieceTypes";
import { CompatiblePartCard } from "./CompatiblePartCard";

const component = { id: 3, code: "motor_m1", name: "Motor M1", path: "Motor M1" };
const inStock: CompatibleProduct = {
  id: 10, sku: "DJI-T50-MOTOR-CW", name: "Motor CW", part_number: "YC.JG.MY001043",
  stock_quantity: "4.00", reserved_quantity: "0.00", available_quantity: "4.00",
  sale_price: "450.00", location: "A-03", is_primary: true, component,
};
const outOfStock: CompatibleProduct = {
  ...inStock, id: 11, sku: "DJI-T50-MOTOR-CCW", name: "Motor CCW", part_number: "",
  stock_quantity: "0.00", available_quantity: "0.00", is_primary: false,
};

function renderCard(product: CompatibleProduct, disabled = false) {
  const onAdd = vi.fn();
  render(
    <MantineProvider>
      <CompatiblePartCard product={product} disabled={disabled} onAdd={onAdd} />
    </MantineProvider>,
  );
  return onAdd;
}

describe("CompatiblePartCard", () => {
  it("muestra SKU, número de pieza y estado de stock", () => {
    renderCard(inStock);
    expect(screen.getByText("DJI-T50-MOTOR-CW")).toBeInTheDocument();
    expect(screen.getByText(/YC\.JG\.MY001043/)).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
  });

  it("marca la pieza sin existencia", () => {
    renderCard(outOfStock);
    expect(screen.getByText("Sin existencia")).toBeInTheDocument();
    expect(screen.queryByText("Principal")).not.toBeInTheDocument();
  });

  it("agrega la pieza con la cantidad elegida", () => {
    const onAdd = renderCard(inStock);
    fireEvent.change(screen.getByLabelText("Cantidad DJI-T50-MOTOR-CW"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar a la orden/i }));
    expect(onAdd).toHaveBeenCalledWith(inStock, 3);
  });

  it("deshabilita agregar cuando la orden es terminal", () => {
    renderCard(inStock, true);
    expect(screen.getByRole("button", { name: /Agregar a la orden/i })).toBeDisabled();
  });
});
