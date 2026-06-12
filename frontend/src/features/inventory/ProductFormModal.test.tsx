import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductFormModal } from "./ProductFormModal";

const saveMutate = vi.fn().mockResolvedValue({});
vi.mock("./api", () => ({
  useSaveProduct: () => ({ mutateAsync: saveMutate, isPending: false }),
  useCategories: () => ({ data: [] }),
  useSupplierOptions: () => ({ data: [] }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({ data: [] }),
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <ProductFormModal opened onClose={vi.fn()} product={null} />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("ProductFormModal", () => {
  it("permite guardar sin SKU (se autogenera en el backend)", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.change(screen.getByLabelText(/Nombre/), {
      target: { value: "Producto sin SKU" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate.mock.calls[0][0]).toMatchObject({
      name: "Producto sin SKU",
      sku: "",
    });
  });
});
