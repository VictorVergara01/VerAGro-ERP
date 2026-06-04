import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";
import type { DashboardData } from "./useDashboard";

const mockUseDashboard = vi.fn();
vi.mock("./useDashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useDashboard")>();
  return { ...actual, useDashboard: () => mockUseDashboard() };
});

function renderPage() {
  return render(
    <MantineProvider>
      <DashboardPage />
    </MantineProvider>,
  );
}

const data: DashboardData = {
  inventory: { total_products: 5, total_stock_value: 100, low_stock_count: 2 },
  service_orders_by_status: { received: 1, in_progress: 2, waiting_parts: 7, finished: 4 },
  invoices: { pending_count: 6, pending_amount: 500, sales_this_month: 1200 },
  top_customers: [],
  top_failing_equipment: [],
  purchases_by_supplier: [],
};

describe("DashboardPage", () => {
  it("muestra las tarjetas con los datos", () => {
    mockUseDashboard.mockReturnValue({ data, isLoading: false, error: null });
    renderPage();
    expect(screen.getByText("Órdenes abiertas")).toBeInTheDocument();
    // received(1) + in_progress(2) = 3 abiertas
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Esperando piezas")).toBeInTheDocument();
    expect(screen.getByText("Ventas del mes")).toBeInTheDocument();
  });

  it("muestra aviso amable ante 403", () => {
    mockUseDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("forbidden"),
    });
    renderPage();
    expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  });

  it("muestra skeletons mientras carga", () => {
    mockUseDashboard.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
