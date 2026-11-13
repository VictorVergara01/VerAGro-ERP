import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ReportsPage } from "./ReportsPage";

const mockBelowFloor = vi.fn();
const mockSales = vi.fn();
const mockField = vi.fn();
const mockCosts = vi.fn();
const mockAccounts = vi.fn();
vi.mock("../field-collections/api", () => ({
  COLLECTION_STATUS: { pending: "Pendiente", partial: "Abonado", paid: "Pagado", overdue: "Vencido" },
  useFieldAccounts: (...args: unknown[]) => {
    mockAccounts(...args);
    return { isLoading: false, error: null, data: { items: [], summary: { total: 0, collected: 0, balance_due: 0, overdue: 0 } } };
  },
}));
vi.mock("../field-finance/api", () => ({ useFieldFinanceReport: (...args: unknown[]) => {
  mockCosts(...args);
  return { isLoading: false, error: null, data: {
    revenue: 100, pilot_cost: 20, assistant_cost: 27.5, general_cost: 10, total_cost: 57.5,
    operating_result: 42.5, paid_in_period: 30, collected_in_period: 50, pending_cost: 27.5, receivable: 50,
    unpriced_jobs: [], expenses_by_category: [],
    by_customer: [{ id: 1, name: "Finca de prueba", count: 1, hectares: "10", quintals: "0", revenue: "100", collected: "30", balance_due: "70", pilot_cost: "20", margin_before_general_costs: "80", unpriced_count: 0 }],
    by_pilot: [{ id: 2, name: "Piloto de prueba", count: 1, hectares: "10", quintals: "0", revenue: "100", collected: "30", balance_due: "70", pilot_cost: "20", margin_before_general_costs: "80", unpriced_count: 0 }],
    by_month: [],
  } };
} }));

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
  useSalesReport: (...args: unknown[]) => {
    mockSales(...args);
    return { isLoading: false, error: null, data: null };
  },
  useFieldJobsReport: (...args: unknown[]) => {
    mockField(...args);
    return {
      isLoading: false, error: null,
      data: { scheduled_count: 3, completed_count: 2, actual_hectares: "13.00", applied_quintals: "12.00", by_type: [] },
    };
  },
  useProfitReport: () => ({ isLoading: false, error: null, data: null }),
  useBelowFloorSalesReport: () => mockBelowFloor(),
}));

function renderPage() {
  return render(
    <MemoryRouter><MantineProvider>
      <ReportsPage />
    </MantineProvider></MemoryRouter>,
  );
}

describe("ReportsPage", () => {
  it("presenta resultados por cliente y piloto sin repartir gastos generales", async () => {
    mockBelowFloor.mockReturnValue({ isLoading: false, error: null, data: null });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Trabajos de campo"));
    await user.click(screen.getByRole("tab", { name: "Clientes y pilotos" }));
    expect(screen.getByText("Finca de prueba")).toBeInTheDocument();
    expect(screen.getByText("Piloto de prueba")).toBeInTheDocument();
    expect(screen.getByText(/sin distribuirlos entre clientes o pilotos/)).toBeInTheDocument();
  });
  it("muestra costos y resultado solo dentro de los reportes de campo", async () => {
    mockBelowFloor.mockReturnValue({ isLoading: false, error: null, data: null });
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole("tab", { name: "Costos y resultado" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Trabajos de campo"));
    await user.click(screen.getByRole("tab", { name: "Costos y resultado" }));
    expect(screen.getByText("Costo de pilotos")).toBeInTheDocument();
    expect(screen.getByText("Costo de asistentes")).toBeInTheDocument();
    expect(screen.getByText("Resultado operativo")).toBeInTheDocument();
    expect(mockCosts).toHaveBeenLastCalledWith({ from: "", to: "" });
  });
  it("separa campo de taller y repuestos y conserva las fechas seleccionadas", async () => {
    mockBelowFloor.mockReturnValue({ isLoading: false, error: null, data: null });
    mockSales.mockClear();
    mockField.mockClear();
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText("Taller y repuestos")).toBeInTheDocument();
    expect(mockSales).toHaveBeenLastCalledWith({ from: "", to: "" }, "workshop");
    expect(mockField).not.toHaveBeenCalled();
    await user.click(screen.getByText("Trabajos de campo"));
    expect(screen.getByText("Actividad de campo")).toBeInTheDocument();
    expect(screen.getByText("13.00")).toBeInTheDocument();
    expect(screen.queryByText("Bajo stock")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Órdenes de servicio" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Desde"), "2026-10-01");
    await user.click(screen.getByRole("tab", { name: "Cobros y saldos" }));
    expect(mockAccounts).toHaveBeenLastCalledWith({ from: "2026-10-01", to: "", search: "", collection_status: "" });
    await user.click(screen.getByText("Taller y repuestos"));
    expect(mockSales).toHaveBeenLastCalledWith({ from: "2026-10-01", to: "" }, "workshop");
    expect(screen.queryByText("Actividad de campo")).not.toBeInTheDocument();
  });

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
