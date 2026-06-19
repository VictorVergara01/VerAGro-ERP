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
    data: { fumigation_price_per_hectare: "20", spreading_price_per_quintal: "10",
      drone_tank_volume_liters: "30", default_water_per_hectare: "8" },
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
  it("muestra Hectáreas para fumigación y Quintales al cambiar a esparcido", () => {
    renderForm();
    expect(screen.getByLabelText(/hectáreas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Esparcido / abono"));
    expect(screen.getByLabelText(/quintales/i)).toBeInTheDocument();
  });
});
