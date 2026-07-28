import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InteractivePartsTab } from "./InteractivePartsTab";

const addMutate = vi.fn().mockResolvedValue({});
const tree = [
  {
    id: 1, code: "propulsion", name: "Sistema de propulsión", component_type: "assembly",
    diagram_key: "propulsion", position: "", sort_order: 0,
    children: [
      { id: 3, code: "motor_m1", name: "Motor M1", component_type: "position",
        diagram_key: "motor_m1", position: "", sort_order: 0, children: [] },
    ],
  },
];
const compat = {
  equipment_model: { id: 1, name: "DJI Agras T50" },
  component: { id: 3, name: "Motor M1", path: "Sistema de propulsión > Motor M1" },
  products: [
    { id: 10, sku: "MOT-1", name: "Motor CW", stock_quantity: "4.00", reserved_quantity: "0.00",
      available_quantity: "4.00", sale_price: "450.00", location: "A-03", is_primary: true },
  ],
};

vi.mock("../api", () => ({
  useOrderComponentTree: () => ({ data: tree, isLoading: false, error: null }),
  useCompatibleProducts: (_o: number, componentId?: number) => ({
    data: componentId ? compat : undefined,
    isLoading: false,
  }),
  useAddPart: () => ({ mutateAsync: addMutate, isPending: false }),
}));

function renderTab(status = "in_progress") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        <InteractivePartsTab
          order={{ id: 27, status, equipment_catalog_model: 1, equipment_catalog_model_name: "DJI Agras T50" } as never}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("InteractivePartsTab", () => {
  it("muestra el árbol del despiece", () => {
    renderTab();
    expect(screen.getByText("Sistema de propulsión")).toBeInTheDocument();
  });

  it("al seleccionar un componente carga y agrega una pieza compatible", async () => {
    addMutate.mockClear();
    renderTab();
    fireEvent.click(screen.getByText("Sistema de propulsión"));
    // Selecciona la hoja para ver piezas
    fireEvent.click(await screen.findByText("Motor M1"));
    fireEvent.click(await screen.findByRole("button", { name: /Agregar a la orden/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toMatchObject({ product: 10, component: 3 });
  });
});
