import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { InitialCountPage } from "./InitialCountPage";

vi.mock("./api", () => ({
  useCategories: () => ({ data: [{ id: 1, name: "Motores T50" }] }),
  useInitialCountProgress: () => ({ data: { total: 2, counted: 1, uncounted: 1, counted_zero: 1 } }),
  useProducts: () => ({ data: { count: 2, results: [
    { id: 1, sku: "T50-1", name: "Motor sin contar", category: 1, initial_counted_at: null, initial_counted_quantity: null, stock_quantity: "0" },
    { id: 2, sku: "T50-2", name: "Motor revisado", category: 1, initial_counted_at: "2026-11-11T10:00:00Z", initial_counted_quantity: "0.00", stock_quantity: "0.00" },
  ] } }),
}));
vi.mock("../equipment/api", () => ({ useEquipmentModels: () => ({ data: [{ id: 1, brand: "DJI", name: "Agras T50" }] }) }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "inventory" } }) }));

describe("InitialCountPage", () => {
  it("distingue un cero sin verificar del cero contado y conserva las categorías", () => {
    render(<MantineProvider><MemoryRouter><InitialCountPage /></MemoryRouter></MantineProvider>);
    const pending = screen.getByText("Motor sin contar").closest("tr")!;
    const counted = screen.getByText("Motor revisado").closest("tr")!;
    expect(within(pending).getByText("Sin contar")).toBeInTheDocument();
    expect(within(pending).getByText("Pendiente de verificar")).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: "Registrar conteo" })).toBeInTheDocument();
    expect(within(counted).getByText("Contado en cero")).toBeInTheDocument();
    expect(within(counted).getByRole("button", { name: "Ver conteo" })).toBeInTheDocument();
    expect(within(counted).getByText("Motores T50")).toBeInTheDocument();
  });
});
