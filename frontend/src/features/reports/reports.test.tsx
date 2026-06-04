import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportsPage } from "./ReportsPage";

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
    renderPage();
    expect(screen.getByText("Productos activos")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("P-1")).toBeInTheDocument();
    expect(screen.getByText("Piezas bajo stock mínimo")).toBeInTheDocument();
  });
});
