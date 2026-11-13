import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InitialCountModal } from "./InitialCountModal";
import type { Product } from "./types";

const { save } = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue({}) }));
vi.mock("./api", () => ({
  useRecordInitialCount: () => ({ mutateAsync: save, isPending: false }),
  useInitialStockCount: () => ({ data: { counted_quantity: "0.00", unit_cost: null, location: "Bodega", created_at: "2026-11-11T10:00:00Z", counted_by_name: "Almacén", notes: "No hay unidades" } }),
}));
const product = { id: 1, sku: "T50-1", name: "Motor T50", part_number: "DJI-01", average_cost: "0", location: "", reserved_quantity: "0", stock_quantity: "3", updated_at: "2026-11-11T10:00:00Z", initial_counted_at: null, initial_counted_quantity: null } as Product;

function show(p = product) {
  return render(<MantineProvider><InitialCountModal product={p} onClose={vi.fn()} /></MantineProvider>);
}

describe("InitialCountModal", () => {
  it("guarda cero sin exigir costo y sin confundirlo con dejar la cantidad vacía", async () => {
    save.mockClear();
    show();
    const user = userEvent.setup();
    expect(screen.getByLabelText(/Cantidad contada/)).toHaveDisplayValue("");
    await user.type(screen.getByLabelText(/Cantidad contada/), "0");
    expect(screen.getByLabelText(/Costo unitario/)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Guardar conteo" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ quantity: "0", unit_cost: null, location: "", notes: "", expected_updated_at: product.updated_at }));
  });

  it("registra cantidad absoluta, ubicación y costo con la versión del producto", async () => {
    save.mockClear();
    show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Cantidad contada/), "5");
    await user.type(screen.getByLabelText(/Costo unitario/), "12");
    await user.type(screen.getByLabelText("Ubicación"), "Gaveta 4");
    await user.click(screen.getByRole("button", { name: "Guardar conteo" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ quantity: "5", unit_cost: "12", location: "Gaveta 4", notes: "", expected_updated_at: product.updated_at }));
  });

  it("exige costo cuando hay unidades", async () => {
    save.mockClear();
    show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Cantidad contada/), "5");
    await user.click(screen.getByRole("button", { name: "Guardar conteo" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Indica el costo unitario de las existencias.")).toBeInTheDocument();
  });

  it("muestra el conteo guardado sin permitir repetirlo", () => {
    show({ ...product, initial_counted_at: "2026-11-11T10:00:00Z", initial_counted_quantity: "0" });
    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(screen.getByText(/Almacén/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar conteo" })).not.toBeInTheDocument();
  });
});
