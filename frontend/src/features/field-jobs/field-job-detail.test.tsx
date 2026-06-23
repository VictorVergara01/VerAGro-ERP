import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FieldJobDetailPage } from "./FieldJobDetailPage";

const job = {
  id: 1, number: "TC-000001", job_type: "fumigation", job_type_display: "Fumigación",
  status: "scheduled", status_display: "Programado", customer_name: "Finca La Esperanza",
  location: "Lote 3", crop: "rice", crop_display: "Arroz", crop_other: "",
  scheduled_date: "2026-06-18", hectares: "12.5000", unit_price: "20.00", total: "250.00",
};
vi.mock("./api", () => ({
  useFieldJob: () => ({ data: job, isLoading: false, error: null }),
  useFieldJobAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({ useCompany: () => ({ data: {} }) }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "super_admin" } }) }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "1" }),
}));

describe("FieldJobDetailPage", () => {
  it("muestra el trabajo y el botón Marcar hecho en estado programado", () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <FieldJobDetailPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByText("TC-000001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar hecho/i })).toBeInTheDocument();
  });
});
