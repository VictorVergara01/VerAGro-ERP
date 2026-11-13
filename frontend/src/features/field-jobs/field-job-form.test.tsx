import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldJobFormModal } from "./FieldJobFormModal";
import type { FieldJob } from "./types";

const { saveJob } = vi.hoisted(() => ({ saveJob: vi.fn().mockResolvedValue({}) }));

vi.mock("./api", () => ({
  useSaveFieldJob: () => ({ mutateAsync: saveJob, isPending: false }),
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
vi.mock("../field-finance/api", () => ({ usePilots: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({
  useCompany: () => ({
    data: { fumigation_price_per_hectare: "20", spreading_price_per_quintal: "15", spreading_price_per_hectare: "25", drone_tank_volume_liters: "200",
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
  it("programa quintales totales directamente sin exigir una dosis por hectárea", async () => {
    saveJob.mockClear();
    renderForm({ id: 1, customer: 7, job_type: "spreading", billing_unit: "qq", planned_quintals: "30", hectares: "10", unit_price: "15" });
    expect(screen.getByText(/450\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await vi.waitFor(() => expect(saveJob).toHaveBeenCalledTimes(1));
    expect(saveJob.mock.calls[0][0]).toMatchObject({ planned_quintals: "30", quintals_per_hectare: null });
  });
  it("carga $25/ha para pasto y $15/qq para urea al elegir la modalidad", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Tipo de aplicación" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Aplicación de sólidos"));
    expect(screen.getByLabelText("Precio/ha ($)")).toHaveDisplayValue("25");
    fireEvent.change(screen.getByLabelText("Hectáreas programadas"), { target: { value: "10" } });
    expect(screen.getByText(/250\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Modalidad de cobro" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Por quintal (qq)"));
    expect(screen.getByLabelText("Precio/qq ($)")).toHaveDisplayValue("15");
    fireEvent.change(screen.getByLabelText("Dosis prevista (qq/ha)"), { target: { value: "3" } });
    expect(screen.getByText(/450\.00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Precio/qq ($)"), { target: { value: "16" } });
    expect(screen.getByText(/480\.00/)).toBeInTheDocument();
  });
  it("guarda sólidos con unidades de masa y sin datos de pulverización", async () => {
    saveJob.mockClear();
    renderForm({ id: 1, customer: 7, job_type: "spreading", hectares: "5", unit_price: "12" });
    expect(screen.getByRole("combobox", { name: "Tipo de aplicación" })).toHaveValue("Aplicación de sólidos");
    expect(screen.queryByText(/Detalles de aplicación/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Agregar producto sólido/i }));
    fireEvent.change(screen.getByPlaceholderText(/Nombre del producto sólido/i), { target: { value: "Abono" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await vi.waitFor(() => expect(saveJob).toHaveBeenCalledTimes(1));
    expect(saveJob.mock.calls[0][0]).toMatchObject({ job_type: "spreading", water_per_hectare: null, tank_volume_liters: null });
    expect(saveJob.mock.calls[0][0].products[0]).toMatchObject({ name: "Abono", unit: "qq/ha" });
  });

  it("calcula 30 qq para 10 ha de urea a 3 qq/ha y cobra por qq", async () => {
    saveJob.mockClear();
    renderForm({ id: 1, customer: 7, job_type: "spreading", billing_unit: "qq", quintals_per_hectare: "3", hectares: "10", unit_price: "5" });
    expect(screen.getByLabelText("Precio/qq ($)")).toHaveDisplayValue("5");
    expect(screen.getByText("30 qq")).toBeInTheDocument();
    expect(screen.getByText(/150\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await vi.waitFor(() => expect(saveJob).toHaveBeenCalledTimes(1));
    expect(saveJob.mock.calls[0][0]).toMatchObject({ billing_unit: "qq", quintals_per_hectare: "3", hectares: "10", unit_price: "5" });
  });

  it("cobrar por hectárea conserva el área aunque la carga sea 3 qq/ha", () => {
    renderForm({ id: 1, customer: 7, job_type: "spreading", billing_unit: "ha", quintals_per_hectare: "3", hectares: "10", unit_price: "5" });
    expect(screen.getByLabelText("Precio/ha ($)")).toHaveDisplayValue("5");
    expect(screen.getByText("30 qq")).toBeInTheDocument();
    expect(screen.getByText(/50\.00/)).toBeInTheDocument();
  });

  it("vacía la receta al cambiar de pulverización a sólidos", async () => {
    renderForm({ id: 1, customer: 7, products: [{ id: 1, name: "Líquido", dose_per_hectare: "2", unit: "L/ha" }] });
    expect(screen.getByDisplayValue("Líquido")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Tipo de aplicación" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Aplicación de sólidos"));
    expect(screen.queryByDisplayValue("Líquido")).not.toBeInTheDocument();
  });
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
