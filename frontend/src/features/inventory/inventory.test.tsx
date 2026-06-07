import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InventoryPage } from "./InventoryPage";

const mockProducts = vi.fn();
vi.mock("./api", () => ({
  useProducts: () => mockProducts(),
  useLowStock: () => ({ data: [], isLoading: false, error: null }),
  useCategories: () => ({ data: [{ id: 1, name: "Repuestos" }] }),
  useDeleteProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSupplierOptions: () => ({ data: [] }),
  useAdjustStock: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({ data: [] }),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "super_admin" } }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <MemoryRouter>
            <InventoryPage />
          </MemoryRouter>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("InventoryPage", () => {
  it("muestra productos con categoría resuelta y precio", () => {
    mockProducts.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            sku: "P-1",
            name: "Hélice",
            category: 1,
            stock_quantity: "10.00",
            available_quantity: "8.00",
            minimum_stock: "2.00",
            sale_price: "18.00",
            is_active: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    // Valores únicos de la fila (el filtro de categoría repite "Repuestos").
    expect(screen.getByText("P-1")).toBeInTheDocument();
    expect(screen.getByText("Hélice")).toBeInTheDocument();
    expect(
      screen.getByText((t) => t.includes("18.00")),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Repuestos").length).toBeGreaterThan(0);
  });

  it("muestra estado vacío", () => {
    mockProducts.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay productos.")).toBeInTheDocument();
  });
});
