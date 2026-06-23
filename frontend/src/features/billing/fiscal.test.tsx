import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { InvoiceDetailPage } from "./InvoiceDetailPage";

const mockInvoice = vi.fn();
const emitMutate = vi.fn().mockResolvedValue({});
const downloadCafe = vi.fn().mockResolvedValue(undefined);

vi.mock("./api", () => ({
  useInvoice: () => mockInvoice(),
  useInvoiceAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmitFiscal: () => ({ mutateAsync: emitMutate, isPending: false }),
  useRecordPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./documents", () => ({
  downloadCafePdf: (...args: unknown[]) => downloadCafe(...args),
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
  lines: [],
  payments: [],
};

function renderDetail() {
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

describe("InvoiceDetailPage — Factura Electrónica", () => {
  it("muestra el botón Emitir cuando la factura emitida no tiene CUFE", async () => {
    mockInvoice.mockReturnValue({
      data: { ...baseInvoice, fiscal: null },
      isLoading: false,
      error: null,
    });
    renderDetail();
    const btn = screen.getByRole("button", {
      name: /Emitir Factura Electrónica/i,
    });
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    expect(emitMutate).toHaveBeenCalled();
  });

  it("muestra el CUFE y Descargar CAFE cuando ya está emitida", async () => {
    mockInvoice.mockReturnValue({
      data: {
        ...baseInvoice,
        fiscal: {
          cufe: "FE" + "a".repeat(64),
          status: "authorized",
          status_display: "Autorizada",
          protocol: "12345",
          environment: "demo",
          issued_at: "2026-06-02",
        },
      },
      isLoading: false,
      error: null,
    });
    renderDetail();
    expect(screen.getByText(/FEaaaa/)).toBeInTheDocument();
    expect(screen.getByText("Autorizada (demo)")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Descargar CAFE/i });
    await userEvent.click(btn);
    expect(downloadCafe).toHaveBeenCalled();
  });

  it("no muestra la tarjeta fiscal en una factura en borrador", () => {
    mockInvoice.mockReturnValue({
      data: { ...baseInvoice, status: "draft", fiscal: null },
      isLoading: false,
      error: null,
    });
    renderDetail();
    expect(screen.queryByText("Factura Electrónica")).not.toBeInTheDocument();
  });
});
