import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldJobFormModal } from "./FieldJobFormModal";
import type { FieldJob } from "./types";

vi.mock("./api", () => ({
  useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCalculateMix: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../customers/api", () => ({
  useCustomers: () => ({ data: { results: [{ id: 7, name: "Finca La Esperanza" }] } }),
}));
vi.mock("../field-plots/api", () => ({
  useFieldPlots: () => ({
    data: [
      {
        id: 3,
        name: "Potrero 1",
        hectares: "15.0000",
        crop: "corn",
        crop_other: "",
        location: "Entrada norte",
        water_per_hectare: "20.00",
        products: [{ id: 1, name: "Glifosato", dose_per_hectare: "10.0000", unit: "L/ha" }],
      },
    ],
    isLoading: false,
  }),
}));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ usePilots: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({
  useCompany: () => ({
    data: { fumigation_price_per_hectare: "20", drone_tank_volume_liters: "200",
      default_water_per_hectare: "8" },
  }),
}));

function renderForm(job: Partial<FieldJob> | null = null) {
  return render(
    <MantineProvider>
      <FieldJobFormModal opened onClose={() => {}} job={job as FieldJob | null} />
    </MantineProvider>,
  );
}

describe("FieldJobFormModal", () => {
  it("muestra Hectáreas (fumigación) y NO muestra Quintales", () => {
    renderForm();
    expect(screen.getByLabelText(/hectáreas/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/quintales/i)).not.toBeInTheDocument();
  });

  it("revela el texto de cultivo al elegir Otros", () => {
    renderForm();
    expect(screen.queryByLabelText(/especifica el cultivo/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^cultivo$/i), { target: { value: "other" } });
    expect(screen.getByLabelText(/especifica el cultivo/i)).toBeInTheDocument();
  });

  it("permite agregar un químico a la lista", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /agregar químico/i }));
    expect(screen.getByPlaceholderText(/nombre del químico/i)).toBeInTheDocument();
  });

  it("deshabilita el botón al llegar a 10 químicos", () => {
    renderForm();
    const addBtn = screen.getByRole("button", { name: /agregar químico/i });
    for (let i = 0; i < 10; i++) fireEvent.click(addBtn);
    expect(addBtn).toBeDisabled();
    expect(screen.getByText(/máximo 10 químicos/i)).toBeInTheDocument();
  });

  it("no muestra el selector de lote sin cliente elegido", () => {
    renderForm();
    expect(screen.queryByLabelText(/^lote$/i)).not.toBeInTheDocument();
  });

  it("al elegir un lote copia sus datos y avisa", async () => {
    renderForm();
    // Mantine Select es un input con listbox; se elige por texto de la opción.
    // getByLabelText matchea también el listbox (aria-labelledby apunta al mismo label),
    // así que para abrir el combobox se usa getByRole con el nombre accesible del input.
    fireEvent.click(screen.getByRole("combobox", { name: /^cliente$/i }));
    fireEvent.click(await screen.findByText("Finca La Esperanza"));

    fireEvent.click(screen.getByRole("combobox", { name: /^lote$/i }));
    fireEvent.click(await screen.findByText("Potrero 1"));

    expect(screen.getByText(/datos del lote cargados/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/finca \/ ubicación/i)).toHaveValue("Entrada norte");
    // NumberInput normaliza los decimales: se compara con regex, no con "15".
    expect(screen.getByLabelText(/hectáreas/i)).toHaveDisplayValue(/^15/);
    expect(screen.getByDisplayValue("Glifosato")).toBeInTheDocument();
  });

  it("muestra el lote ya enlazado aunque esté desactivado (no en la lista de activos)", () => {
    // El mock de useFieldPlots solo trae el lote id 3 (activo). Este trabajo apunta
    // a un lote id 5 que ya no está activo: el Select no debe quedar en blanco.
    renderForm({
      id: 1,
      customer: 7,
      plot: 5,
      plot_name: "Potrero desactivado",
    } as unknown as Partial<FieldJob>);

    expect(screen.getByRole("combobox", { name: /^lote$/i })).toHaveValue(
      "Potrero desactivado",
    );
  });
});
