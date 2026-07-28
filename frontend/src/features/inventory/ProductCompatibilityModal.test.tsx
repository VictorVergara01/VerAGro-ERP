import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductCompatibilityModal } from "./ProductCompatibilityModal";

const saveMutate = vi.fn().mockResolvedValue({});
const delMutate = vi.fn().mockResolvedValue({});

vi.mock("../equipment/api", () => ({
  useEquipmentModels: () => ({
    data: [{ id: 1, equipment_type: 1, brand: "DJI", name: "DJI Agras T50", model_code: "T50" }],
  }),
}));
vi.mock("./api", () => ({
  useComponentsByModel: (modelId: number | undefined) => ({
    data: modelId
      ? [
          { id: 3, equipment_model: 1, code: "motor_m1", name: "Motor M1", path: "Propulsión > Brazo M1 > Motor M1" },
          { id: 6, equipment_model: 1, code: "prop_m1", name: "Hélice M1", path: "Propulsión > Brazo M1 > Hélice M1" },
        ]
      : [],
  }),
  useProductCompatibilities: () => ({
    data: [
      {
        id: 50, product: 10, equipment_model: 1, equipment_model_name: "DJI Agras T50",
        component: 3, component_name: "Motor M1", component_path: "Propulsión > Brazo M1 > Motor M1",
        is_primary: true, notes: "",
      },
    ],
  }),
  useSaveCompatibility: () => ({ mutateAsync: saveMutate, isPending: false }),
  useDeleteCompatibility: () => ({ mutateAsync: delMutate, isPending: false }),
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <ProductCompatibilityModal
            opened
            onClose={vi.fn()}
            product={{ id: 10, sku: "MOT-1", name: "Motor CW" } as never}
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("ProductCompatibilityModal", () => {
  it("lista las compatibilidades existentes con su ruta", () => {
    renderModal();
    expect(screen.getByText(/Propulsión > Brazo M1 > Motor M1/)).toBeInTheDocument();
    // Coincidencia exacta: el Select "Modelo técnico" renderiza una etiqueta oculta
    // "DJI DJI Agras T50" (marca + nombre) que colisiona con un regex /DJI Agras T50/.
    expect(screen.getByText("DJI Agras T50")).toBeInTheDocument();
  });

  it("agrega una compatibilidad eligiendo modelo y componente", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.click(screen.getByRole("combobox", { name: /Modelo técnico/ }));
    fireEvent.click(await screen.findByText("DJI DJI Agras T50"));
    fireEvent.click(screen.getByRole("combobox", { name: /Componente/ }));
    fireEvent.click(await screen.findByText(/Hélice M1/));
    fireEvent.click(screen.getByRole("button", { name: "Agregar compatibilidad" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate.mock.calls[0][0]).toMatchObject({
      product: 10, equipment_model: 1, component: 6,
    });
  });

  it("elimina una compatibilidad existente", async () => {
    delMutate.mockClear();
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar compatibilidad/ }));
    await waitFor(() => expect(delMutate).toHaveBeenCalledWith(50));
  });
});
