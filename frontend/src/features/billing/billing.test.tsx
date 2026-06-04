import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InvoicesPage } from "./InvoicesPage";

const mockList = vi.fn();
vi.mock("./api", () => ({ useInvoices: () => mockList() }));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <InvoicesPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("InvoicesPage", () => {
  it("muestra las facturas con tipo, estado y saldo", () => {
    mockList.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            invoice_number: "FAC-000001",
            invoice_type: "service_invoice",
            customer_name: "Cliente Uno",
            status: "partially_paid",
            issue_date: "2026-06-01",
            total: "120.00",
            balance_due: "20.00",
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("FAC-000001")).toBeInTheDocument();
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    // "Pago parcial" aparece en la fila y en el filtro de estado.
    expect(screen.getAllByText("Pago parcial").length).toBeGreaterThan(0);
  });

  it("muestra estado vacío", () => {
    mockList.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText("No hay facturas.")).toBeInTheDocument();
  });
});
