import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportsPage } from "./ReportsPage";

const mockBelowFloor = vi.fn();

vi.mock("./api", () => ({
  useLowStockReport: () => ({
    isLoading: false,
    error: null,
    data: {
      summary: { total_products: 8, total_stock_value: "490.05" },
      low_stock: [
        {
          id: 1,
          sku: "P-1",
          name: "Hélice",
          stock_quantity: "1.00",
          reserved_quantity: "0.00",
          minimum_stock: "5.00",
          available_quantity: "1.00",
        },
      ],
    },
  }),
  useServiceOrdersReport: () => ({ isLoading: false, error: null, data: null }),
  useSalesReport: () => ({ isLoading: false, error: null, data: null }),
  useProfitReport: () => ({ isLoading: false, error: null, data: null }),
  useBelowFloorSalesReport: () => mockBelowFloor(),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <ReportsPage />
    </MantineProvider>,
  );
}

describe("ReportsPage", () => {
  it("muestra el reporte de bajo stock por defecto", () => {
    mockBelowFloor.mockReturnValue({ isLoading: false, error: null, data: null });
    renderPage();
    expect(screen.getByText("Productos activos")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("P-1")).toBeInTheDocument();
    expect(screen.getByText("Piezas bajo stock mínimo")).toBeInTheDocument();
  });

  it("muestra las ventas bajo el piso con el precio en rojo", () => {
    mockBelowFloor.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        count: 1,
        items: [
          {
            document: "FAC-000002",
            document_type: "invoice",
            date: "2026-06-05",
            created_by: "Vendedor Uno",
            product_id: 5,
            product_sku: "HEL",
            product_name: "Hélice",
            quantity: "1.00",
            unit_price: "30.00",
            price_floor: "34.38",
            // El backend devuelve estos dos campos en positivo (test_below_floor.py
            // asserta +4.38 / 12.74): antes este fixture tenía el signo invertido y
            // un porcentaje ligeramente distinto (-12.73), sin que nada lo notara
            // por ser un mock nunca validado contra la forma real de la respuesta.
            difference: "4.38",
            difference_percentage: "12.74",
          },
        ],
      },
    });
    renderPage();
    expect(screen.getByText("FAC-000002")).toBeInTheDocument();
    expect(screen.getByText("HEL — Hélice")).toBeInTheDocument();
    expect(screen.getByText("Vendedor Uno")).toBeInTheDocument();
    expect(screen.getByText(/-12\.74/)).toBeInTheDocument();
  });

  it("muestra 'Sin acceso' en ventas bajo el piso cuando el rol no tiene acceso al financiero", () => {
    mockBelowFloor.mockReturnValue({
      isLoading: false,
      error: new Error("forbidden"),
      data: null,
    });
    renderPage();
    expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  });
});
