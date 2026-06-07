import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ServiceOrdersPage } from "./ServiceOrdersPage";

const mockList = vi.fn();
vi.mock("./api", () => ({
  useServiceOrders: () => mockList(),
  useSaveServiceOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTechnicians: () => ({ data: [] }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({
  useEquipmentList: () => ({ data: { results: [] } }),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "super_admin" } }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ServiceOrdersPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("ServiceOrdersPage", () => {
  it("muestra las órdenes con cliente y estado", () => {
    mockList.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            service_order_number: "OS-000001",
            customer_name: "Cliente Uno",
            equipment_name: "Agras T50",
            service_type: "repair",
            status: "in_progress",
            received_date: "2026-06-01",
            total_amount: "150.00",
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("OS-000001")).toBeInTheDocument();
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("Agras T50")).toBeInTheDocument();
    // "En proceso" aparece en la fila y en el filtro de estado.
    expect(screen.getAllByText("En proceso").length).toBeGreaterThan(0);
  });

  it("muestra estado vacío", () => {
    mockList.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay órdenes de servicio.")).toBeInTheDocument();
  });
});
