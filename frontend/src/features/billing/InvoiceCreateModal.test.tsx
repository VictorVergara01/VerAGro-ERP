import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvoiceCreateModal } from "./InvoiceCreateModal";

const useProductsSpy = vi.fn();

vi.mock("./api", () => ({
  useCreateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../customers/api", () => ({
  useCustomers: () => ({
    data: { count: 1, results: [{ id: 1, name: "Cliente Uno" }] },
  }),
}));
vi.mock("../inventory/api", () => ({
  useProducts: (params: unknown) => useProductsSpy(params),
}));

function renderModal() {
  return render(
    <MantineProvider>
      <Notifications />
      <MemoryRouter>
        <InvoiceCreateModal opened onClose={() => {}} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** Catálogo grande: el servidor devuelve una página de 2 sobre un total de 337. */
function respuestaPaginada() {
  return {
    isFetching: false,
    data: {
      count: 337,
      results: [
        { id: 1, sku: "T50-001", name: "Hélice", sale_price: "35.75", average_cost: "27.50" },
        { id: 2, sku: "T50-002", name: "Motor", sale_price: "120.00", average_cost: "90.00" },
      ],
    },
  };
}

describe("InvoiceCreateModal · selector de producto", () => {
  beforeEach(() => {
    useProductsSpy.mockReset();
    useProductsSpy.mockReturnValue(respuestaPaginada());
  });

  it("busca en el servidor en vez de filtrar sólo la primera página", async () => {
    // El defecto original: el modal llamaba useProducts({}) y filtraba en cliente,
    // así que con 337 productos sólo se podían elegir los 25 de la primera página.
    const user = userEvent.setup();
    renderModal();

    // Arranca sin término de búsqueda, pidiendo una página mayor que la del backend.
    expect(useProductsSpy).toHaveBeenCalledWith({ search: undefined, pageSize: 50 });

    await user.click(screen.getByRole("button", { name: /Agregar línea/i }));
    const selector = screen.getAllByPlaceholderText("—")[0];
    await user.type(selector, "motor");

    // El término viaja al servidor (tras el debounce de 300 ms).
    await waitFor(
      () => {
        expect(useProductsSpy).toHaveBeenCalledWith({ search: "motor", pageSize: 50 });
      },
      { timeout: 2000 },
    );
  });

  it("avisa cuando el catálogo no cabe en la página cargada", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: /Agregar línea/i }));

    expect(screen.getByText(/Mostrando 2 de 337: escribe para buscar/)).toBeInTheDocument();
  });

  it("no avisa cuando el catálogo entero ya está cargado", async () => {
    useProductsSpy.mockReturnValue({
      isFetching: false,
      data: {
        count: 2,
        results: [
          { id: 1, sku: "T50-001", name: "Hélice", sale_price: "35.75", average_cost: "27.50" },
          { id: 2, sku: "T50-002", name: "Motor", sale_price: "120.00", average_cost: "90.00" },
        ],
      },
    });
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: /Agregar línea/i }));

    expect(screen.queryByText(/escribe para buscar/)).not.toBeInTheDocument();
  });
});
