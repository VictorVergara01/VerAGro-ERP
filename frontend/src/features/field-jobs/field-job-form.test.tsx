import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldJobFormModal } from "./FieldJobFormModal";

vi.mock("./api", () => ({
  useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCalculateMix: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({
  useCompany: () => ({
    data: { fumigation_price_per_hectare: "20", drone_tank_volume_liters: "200",
      default_water_per_hectare: "8" },
  }),
}));

function renderForm() {
  return render(
    <MantineProvider>
      <FieldJobFormModal opened onClose={() => {}} job={null} />
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
});
