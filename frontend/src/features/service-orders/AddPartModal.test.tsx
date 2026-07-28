import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddPartModal } from "./AddPartModal";

const addMutate = vi.fn().mockResolvedValue({});

vi.mock("./api", () => ({
  useAddPart: () => ({ mutateAsync: addMutate, isPending: false }),
}));
vi.mock("../inventory/api", () => ({
  useProducts: () => ({
    data: {
      results: [
        { id: 10, sku: "IMP-1", name: "Impeller pump motor", category: 5 },
        { id: 20, sku: "MOT-1", name: "Motor brushless", category: 7 },
      ],
    },
  }),
  useCategories: () => ({
    data: [
      { id: 5, name: "Tanque de fumigación" },
      { id: 7, name: "Motor" },
    ],
  }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({
    data: [
      { id: 1, name: "Agras T50" },
      { id: 2, name: "Generador D12500" },
    ],
  }),
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <AddPartModal
            opened
            onClose={vi.fn()}
            orderId={1}
            equipmentType={1}
            equipmentTypeName="Agras T50"
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("AddPartModal", () => {
  it("preselecciona el modelo de la orden", () => {
    renderModal();
    expect(screen.getByDisplayValue("Agras T50")).toBeInTheDocument();
  });

  it("muestra chips de categoría derivados de las piezas del modelo", () => {
    renderModal();
    expect(
      screen.getByRole("radio", { name: "Tanque de fumigación" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Motor" })).toBeInTheDocument();
  });

  it("filtra las piezas al elegir una categoría", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "Tanque de fumigación" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Pieza" }));
    const options = await screen.findByRole("listbox");
    expect(within(options).getByText(/Impeller pump motor/)).toBeInTheDocument();
    expect(within(options).queryByText(/Motor brushless/)).not.toBeInTheDocument();
  });

  it("envía la pieza seleccionada", async () => {
    addMutate.mockClear();
    renderModal();
    fireEvent.click(screen.getByRole("combobox", { name: "Pieza" }));
    const options = await screen.findByRole("listbox");
    fireEvent.click(within(options).getByText(/Impeller pump motor/));
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await vi.waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toMatchObject({ product: 10 });
  });
});
