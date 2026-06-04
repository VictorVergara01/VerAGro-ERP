import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { EquipmentPage } from "./EquipmentPage";

const mockList = vi.fn();
vi.mock("./api", () => ({
  useEquipmentList: () => mockList(),
  useDeleteEquipment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEquipmentTypes: () => ({ data: [{ id: 1, name: "Drone agrícola" }] }),
  useSaveEquipment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// El form usa useCustomers; lo mockeamos para no tocar la red.
vi.mock("../customers/api", () => ({
  useCustomers: () => ({ data: { results: [] } }),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <MemoryRouter>
          <EquipmentPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("EquipmentPage", () => {
  it("muestra las filas con tipo y cliente", () => {
    mockList.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: "Agras T50",
            equipment_type_name: "Drone agrícola",
            customer_name: "Cliente Uno",
            serial_number: "SN-1",
            status: "active",
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    // Valores únicos de la fila (los Selects de filtro repiten estado/tipo).
    expect(screen.getByText("Agras T50")).toBeInTheDocument();
    expect(screen.getByText("SN-1")).toBeInTheDocument();
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
  });

  it("muestra estado vacío", () => {
    mockList.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay equipos.")).toBeInTheDocument();
  });
});
