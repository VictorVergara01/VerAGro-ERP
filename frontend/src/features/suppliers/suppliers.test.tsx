import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SuppliersPage } from "./SuppliersPage";

const mockList = vi.fn();
vi.mock("./api", () => ({
  useSuppliers: () => mockList(),
  useDeleteSupplier: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveSupplier: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "super_admin" } }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <MemoryRouter>
          <SuppliersPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("SuppliersPage", () => {
  it("muestra los proveedores", () => {
    mockList.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: "DronesPanama",
            contact_person: "Juan",
            country: "Panamá",
            phone: "6000",
            email: "j@dp.com",
            is_active: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("DronesPanama")).toBeInTheDocument();
    expect(screen.getByText("Juan")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("muestra estado vacío", () => {
    mockList.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay proveedores.")).toBeInTheDocument();
  });
});
