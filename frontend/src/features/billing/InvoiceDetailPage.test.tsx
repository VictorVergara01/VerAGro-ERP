import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InvoiceDetailPage } from "./InvoiceDetailPage";
import type { InvoiceLine } from "./types";

const mockInvoice = vi.fn();

vi.mock("./api", () => ({
  useInvoice: () => mockInvoice(),
  useInvoiceAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmitFiscal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRecordPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./documents", () => ({
  downloadCafePdf: vi.fn(),
  downloadInvoicePdf: vi.fn(),
  printInvoicePdf: vi.fn(),
  whatsappInvoiceUrl: () => "https://wa.me/",
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));
vi.mock("../inventory/api", () => ({ useProducts: () => ({ data: { results: [] } }) }));
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "super_admin" } }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useParams: () => ({ id: "1" }) };
});

const baseInvoice = {
  id: 1,
  invoice_number: "FAC-000001",
  invoice_type: "service_invoice",
  customer_name: "Cliente Uno",
  status: "issued",
  issue_date: "2026-06-01",
  subtotal: "100.00",
  discount_percentage: "0",
  tax_percentage: "0",
  discount_amount: "0",
  tax_amount: "0",
  total: "100.00",
  paid_amount: "0",
  balance_due: "100.00",
  payments: [],
  fiscal: null,
};

function renderInvoiceDetail(overrides: { lines: Partial<InvoiceLine>[] }) {
  mockInvoice.mockReturnValue({
    data: { ...baseInvoice, lines: overrides.lines },
    isLoading: false,
    error: null,
  });
  return render(
    <MantineProvider>
      <ModalsProvider>
        <MemoryRouter>
          <InvoiceDetailPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("InvoiceDetailPage — aviso de venta bajo el piso", () => {
  it("marca la línea vendida bajo el piso", async () => {
    renderInvoiceDetail({
      lines: [
        {
          id: 1,
          product: 5,
          product_sku: "HEL",
          description: "Hélice",
          quantity: "1",
          unit_price: "30.00",
          below_min_price: true as unknown as string,
          price_floor: "34.38",
        },
      ],
    });
    const price = await screen.findByText(/30\.00/);
    await userEvent.hover(price);
    expect(await screen.findByText(/bajo el mínimo/i)).toBeInTheDocument();
  });

  it("no marca una línea sin piso definido", () => {
    renderInvoiceDetail({
      lines: [
        {
          id: 2,
          product: null,
          product_sku: "",
          description: "Mano de obra",
          quantity: "1",
          unit_price: "50.00",
          below_min_price: false as unknown as string,
          price_floor: null as unknown as string,
        },
      ],
    });
    expect(screen.queryByText(/bajo el mínimo/i)).not.toBeInTheDocument();
  });
});
