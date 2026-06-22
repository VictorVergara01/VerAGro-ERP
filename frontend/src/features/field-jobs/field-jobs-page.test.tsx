import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FieldJobsPage } from "./FieldJobsPage";

const mockList = vi.fn();
vi.mock("./api", () => ({ useFieldJobs: () => mockList(), useSaveFieldJob: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../equipment/api", () => ({ useEquipmentList: () => ({ data: { results: [] } }) }));
vi.mock("../service-orders/api", () => ({ useTechnicians: () => ({ data: [] }) }));
vi.mock("../settings/api", () => ({ useCompany: () => ({ data: {} }) }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "super_admin" } }) }));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <FieldJobsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("FieldJobsPage", () => {
  it("muestra los trabajos con número, finca y total", () => {
    mockList.mockReturnValue({
      data: {
        count: 1, next: null, previous: null,
        results: [{
          id: 1, number: "TC-000001", job_type: "fumigation", job_type_display: "Fumigación",
          status: "scheduled", status_display: "Programado", customer_name: "Finca La Esperanza",
          location: "Lote 3", scheduled_date: "2026-06-18", hectares: "12.5000",
          total: "250.00",
        }],
      },
      isLoading: false, error: null,
    });
    renderPage();
    expect(screen.getByText("TC-000001")).toBeInTheDocument();
    expect(screen.getByText("Finca La Esperanza")).toBeInTheDocument();
    expect(screen.getByText(/250\.00/)).toBeInTheDocument();
  });
});
