import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EquipmentFormModal } from "./EquipmentFormModal";

const saveMutate = vi.fn().mockResolvedValue({});
vi.mock("./api", () => ({
  useSaveEquipment: () => ({ mutateAsync: saveMutate, isPending: false }),
  useEquipmentTypes: () => ({ data: [{ id: 1, name: "Drone agrícola" }] }),
  useEquipmentModels: () => ({
    data: [
      { id: 7, equipment_type: 1, brand: "DJI", name: "DJI Agras T50", model_code: "T50" },
      { id: 8, equipment_type: 2, brand: "DJI", name: "Otro", model_code: "X" },
    ],
  }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <EquipmentFormModal opened onClose={vi.fn()} equipment={null} />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("EquipmentFormModal · modelo técnico", () => {
  it("muestra el selector de modelo técnico", () => {
    renderModal();
    expect(screen.getByRole("combobox", { name: /Modelo técnico/ })).toBeInTheDocument();
  });

  it("al elegir un modelo técnico rellena marca y modelo si están vacíos", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Dron 1" } });
    // El propietario por defecto es "Cliente", que exige seleccionar un cliente
    // (validación existente, no relacionada con el modelo técnico); como el mock
    // de useCustomers no tiene clientes, se cambia a "Empresa" para poder enviar.
    fireEvent.click(screen.getByRole("combobox", { name: /Propietario/ }));
    fireEvent.click(await screen.findByText("Empresa"));
    // Selecciona tipo "Drone agrícola"
    fireEvent.click(screen.getByRole("combobox", { name: /Tipo de equipo/ }));
    fireEvent.click(await screen.findByText("Drone agrícola"));
    // Selecciona modelo técnico
    fireEvent.click(screen.getByRole("combobox", { name: /Modelo técnico/ }));
    // La opción se renderiza como "{brand} {name}" (ver EquipmentFormModal); el
    // fixture ya incluye la marca en el nombre, por lo que se busca por substring.
    fireEvent.click(await screen.findByText(/DJI Agras T50/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    const payload = saveMutate.mock.calls[0][0];
    expect(payload.catalog_model).toBe(7);
    expect(payload.brand).toBe("DJI");
    expect(payload.model).toBe("DJI Agras T50");
  });
});
