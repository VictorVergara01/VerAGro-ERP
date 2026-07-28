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

  it("etiqueta el multiselect como 'Modelos compatibles' y no muestra textarea de texto libre", () => {
    renderModal();
    expect(screen.getByRole("combobox", { name: "Modelos compatibles" })).toBeInTheDocument();
    // El textarea redundante de texto libre ya no existe.
    expect(screen.queryByRole("textbox", { name: /Modelos/ })).toBeNull();
  });

  it("no envía compatible_models en el payload", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.change(screen.getByLabelText(/Nombre/), {
      target: { value: "P" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate.mock.calls[0][0]).not.toHaveProperty("compatible_models");
  });
});
