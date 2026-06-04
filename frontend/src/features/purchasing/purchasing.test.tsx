import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PurchasingPage } from "./PurchasingPage";

const mockList = vi.fn();
vi.mock("./api", () => ({
  usePurchaseOrders: () => mockList(),
  useCreatePurchaseOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// El modal de creación importa hooks de inventory; los mockeamos.
vi.mock("../inventory/api", () => ({
  useProducts: () => ({ data: { results: [] } }),
  useSupplierOptions: () => ({ data: [] }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("PurchasingPage", () => {
  it("muestra las órdenes con estado y total", () => {
    mockList.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            order_number: "OC-000001",
            supplier_name: "DronesPanama",
            order_date: "2026-06-01",
            status: "received",
            grand_total: "490.00",
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("OC-000001")).toBeInTheDocument();
    expect(screen.getByText("DronesPanama")).toBeInTheDocument();
    // "Recibida" aparece en la fila y en el filtro de estado.
    expect(screen.getAllByText("Recibida").length).toBeGreaterThan(0);
  });

  it("muestra estado vacío", () => {
    mockList.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay órdenes de compra.")).toBeInTheDocument();
  });
});
