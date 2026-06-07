import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CustomersPage } from "./CustomersPage";

const mockUseCustomers = vi.fn();
vi.mock("./api", () => ({
  useCustomers: () => mockUseCustomers(),
  useDeleteCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "super_admin" } }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("CustomersPage", () => {
  it("muestra las filas de clientes", () => {
    mockUseCustomers.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: "Cliente Uno",
            customer_type: "person",
            identification_number: "8-123",
            phone: "6000-0000",
            email: "uno@test.com",
            is_active: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("8-123")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("muestra estado vacío", () => {
    mockUseCustomers.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay clientes.")).toBeInTheDocument();
  });
});
