import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { QuoteDetailPage } from "./QuoteDetailPage";
import type { QuoteLine } from "./types";

const mockQuote = vi.fn();

vi.mock("./api", () => ({
  useQuote: () => mockQuote(),
  useQuoteAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConvertQuote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateQuote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQuote: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

const baseQuote = {
  id: 1,
  quote_number: "COT-000001",
  customer_name: "Cliente Uno",
  status: "draft",
  issue_date: "2026-06-01",
  expiration_date: "2026-06-15",
  subtotal: "100.00",
  discount_percentage: "0",
  tax_percentage: "0",
  discount_amount: "0",
  tax_amount: "0",
  total: "100.00",
};

function renderQuoteDetail(overrides: { lines: Partial<QuoteLine>[] }) {
  mockQuote.mockReturnValue({
    data: { ...baseQuote, lines: overrides.lines },
    isLoading: false,
    error: null,
  });
  return render(
    <MantineProvider>
      <ModalsProvider>
        <MemoryRouter>
          <QuoteDetailPage />
        </MemoryRouter>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("QuoteDetailPage — aviso de venta bajo el piso", () => {
  it("marca la línea cotizada bajo el piso, aunque las cotizaciones no entren al reporte", async () => {
    renderQuoteDetail({
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
    renderQuoteDetail({
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
