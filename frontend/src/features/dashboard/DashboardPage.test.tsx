import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";
import type { DashboardData } from "./useDashboard";

const mockUseDashboard = vi.fn();
vi.mock("./useDashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useDashboard")>();
  return { ...actual, useDashboard: () => mockUseDashboard() };
});

const mockUser = vi.fn();
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: mockUser(), status: "authenticated", login: vi.fn(), logout: vi.fn() }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
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
  beforeEach(() => {
    mockUser.mockReturnValue({ id: 1, email: "a@a.com", full_name: "Admin", role: "admin", is_active: true });
  });

  it("muestra las tarjetas con los datos (rol financiero)", () => {
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

  it("rol operativo (técnico) ve accesos rápidos, no el panel financiero", () => {
    mockUser.mockReturnValue({ id: 2, email: "t@t.com", full_name: "Tec", role: "technician", is_active: true });
    mockUseDashboard.mockReturnValue({ data: undefined, isLoading: false, error: null });
    renderPage();
    expect(screen.getByText("Accesos rápidos a tu trabajo del día.")).toBeInTheDocument();
    expect(screen.getByText("Órdenes de servicio")).toBeInTheDocument();
    // No debe mostrar tarjetas financieras.
    expect(screen.queryByText("Ventas del mes")).not.toBeInTheDocument();
  });
});
