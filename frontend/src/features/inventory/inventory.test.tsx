import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InventoryPage } from "./InventoryPage";
import { ProductDetailPage } from "./ProductDetailPage";

const mockProducts = vi.fn();
const mockProduct = vi.fn();
const mockMovements = vi.fn(() => ({ data: [], isLoading: false }));
const mockCostHistory = vi.fn(() => ({ data: [], isLoading: false }));
vi.mock("./api", () => ({
  useProducts: () => mockProducts(),
  useProduct: () => mockProduct(),
  useProductMovements: () => mockMovements(),
  useProductCostHistory: () => mockCostHistory(),
  useLowStock: () => ({ data: [], isLoading: false, error: null }),
  useCategories: () => ({ data: [{ id: 1, name: "Repuestos" }] }),
  useDeleteProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteManyProducts: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSupplierOptions: () => ({ data: [] }),
  useAdjustStock: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useComponentsByModel: () => ({ data: [] }),
  useProductCompatibilities: () => ({ data: [] }),
  useSaveCompatibility: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompatibility: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({ data: [] }),
  useEquipmentModels: () => ({ data: [] }),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "super_admin" } }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "1" }),
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

function renderProductDetail({
  product,
  costHistory = [],
}: {
  product: Record<string, unknown>;
  costHistory?: Record<string, unknown>[];
}) {
  mockProduct.mockReturnValue({ data: product, isLoading: false, error: null });
  mockMovements.mockReturnValue({ data: [], isLoading: false });
  mockCostHistory.mockReturnValue({ data: costHistory, isLoading: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <MemoryRouter>
            <ProductDetailPage />
          </MemoryRouter>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("ProductDetailPage", () => {
  it("muestra el rango de precio y el historial de costos", async () => {
    renderProductDetail({
      product: {
        id: 1, sku: "HEL", name: "Hélice",
        average_cost: "27.50", sale_price: "35.75",
        min_sale_price: "34.38", max_sale_price: "39.88",
      },
      costHistory: [
        {
          id: 9, created_at: "2026-09-03T10:00:00-05:00", movement_type: "purchase_in",
          quantity: "10", unit_cost: "30.0000", average_cost_after: "27.50",
          purchase_order_number: "OC-000019", supplier_name: "DJI Panamá",
          supplier_unit_cost: "20.00", allocated_extra_per_unit: "10.0000",
        },
      ],
    });
    expect(await screen.findByText(/34\.38/)).toBeInTheDocument();
    expect(await screen.findByText("OC-000019")).toBeInTheDocument();
  });

  it("no pinta un rango en 0 como si fuera un precio real", async () => {
    renderProductDetail({
      product: {
        id: 2, sku: "T50-1", name: "Sin costo",
        average_cost: "0.00", sale_price: "0.00",
        min_sale_price: "0.00", max_sale_price: "0.00",
      },
      costHistory: [],
    });
    expect(await screen.findByText("Sin costo")).toBeInTheDocument();
    const minField = screen.getByText("Precio mínimo").closest("div") as HTMLElement;
    const maxField = screen.getByText("Precio máximo").closest("div") as HTMLElement;
    expect(within(minField).getByText("—")).toBeInTheDocument();
    expect(within(minField).queryByText(/0[.,]00/)).not.toBeInTheDocument();
    expect(within(maxField).getByText("—")).toBeInTheDocument();
    expect(within(maxField).queryByText(/0[.,]00/)).not.toBeInTheDocument();
  });

  it("no imprime null en el desglose de una entrada por ajuste", async () => {
    renderProductDetail({
      product: {
        id: 3, sku: "AJ-1", name: "Ajustada",
        average_cost: "10.00", sale_price: "15.00",
        min_sale_price: "12.00", max_sale_price: "18.00",
      },
      costHistory: [
        {
          id: 5, created_at: "2026-09-01T08:00:00-05:00", movement_type: "adjustment_in",
          quantity: "3", unit_cost: "10.0000", average_cost_after: "10.00",
          purchase_order_number: null, supplier_name: null,
          supplier_unit_cost: null, allocated_extra_per_unit: null,
        },
      ],
    });
    expect(await screen.findByText("Ajustada")).toBeInTheDocument();
    const row = (await screen.findByText("3")).closest("tr") as HTMLElement;
    // Orden, Proveedor, Costo prov. y Flete/u deben caer a "—", no a "null".
    expect(within(row).getAllByText("—")).toHaveLength(4);
    expect(within(row).queryByText(/null/i)).not.toBeInTheDocument();
  });
});
