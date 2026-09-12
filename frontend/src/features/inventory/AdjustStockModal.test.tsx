import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdjustStockModal } from "./AdjustStockModal";
import type { Product } from "./types";

vi.mock("./api", () => ({
  useAdjustStock: () => ({ mutateAsync: adjustMutate, isPending: false }),
}));

let adjustMutate: (...args: unknown[]) => unknown = vi.fn();

const PRODUCT: Product = {
  id: 7,
  available_quantity: "10.00",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  sku: "SKU-7",
  name: "Filtro de aceite",
  description: "",
  barcode: "",
  part_number: "",
  brand: "",
  model: "",
  unit_of_measure: "",
  location: "",
  compatible_models: "",
  stock_quantity: "10.00",
  reserved_quantity: "0.00",
  minimum_stock: "2.00",
  average_cost: "27.50",
  last_purchase_cost: "27.50",
  sale_price: "35.75",
  default_margin_percentage: "30.00",
  min_margin_percentage: "25.00",
  max_margin_percentage: "45.00",
  min_sale_price: "34.38",
  max_sale_price: "39.88",
  is_active: true,
  category: null,
  main_supplier: null,
  compatible_equipment_types: [],
};

function renderModal({ adjust }: { adjust: (...args: unknown[]) => unknown }) {
  adjustMutate = adjust;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        <AdjustStockModal opened onClose={vi.fn()} product={PRODUCT} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("AdjustStockModal", () => {
  it("bloquea la entrada sin costo unitario", async () => {
    const adjust = vi.fn();
    renderModal({ adjust });
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(adjust).not.toHaveBeenCalled();
  });

  it("permite la salida sin costo unitario", async () => {
    const adjust = vi.fn().mockResolvedValue({});
    renderModal({ adjust });
    await userEvent.click(screen.getByRole("radio", { name: /Salida/ }));
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(adjust).toHaveBeenCalled();
  });
});
