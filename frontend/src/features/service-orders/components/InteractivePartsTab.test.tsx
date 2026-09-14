import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompatibleProduct } from "../despieceTypes";
import { InteractivePartsTab } from "./InteractivePartsTab";

const addMutate = vi.fn().mockResolvedValue({});

const tanque = { id: 5, code: "tanque_fumigacion", name: "Tanque de fumigación", path: "Tanque de fumigación" };
const helices = { id: 9, code: "helices", name: "Hélices", path: "Hélices" };

function part(over: Partial<CompatibleProduct>): CompatibleProduct {
  return {
    id: 0, sku: "", name: "", part_number: "", stock_quantity: "0.00",
    reserved_quantity: "0.00", available_quantity: "0.00", sale_price: "10.00",
    location: "", is_primary: false, component: tanque, ...over,
  };
}

const products = [
  part({ id: 10, sku: "T50-001", name: "Tanque 40L", part_number: "YC.XX.0001", available_quantity: "2.00" }),
  part({ id: 11, sku: "T50-002", name: "Sensor de nivel", part_number: "YC.XX.0002" }),
  part({ id: 20, sku: "T50-300", name: "Hélice CW", part_number: "YC.HE.0300", component: helices }),
];

vi.mock("../api", () => ({
  useCompatibleProducts: () => ({
    data: { equipment_model: { id: 1, name: "DJI Agras T50" }, component: null, products },
    isLoading: false,
    error: null,
  }),
  useAddPart: () => ({ mutateAsync: addMutate, isPending: false }),
}));

function renderTab(order: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        <InteractivePartsTab
          order={{
            id: 27, status: "in_progress", equipment_catalog_model: 1,
            equipment_catalog_model_name: "DJI Agras T50", ...order,
          } as never}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

const search = () => screen.getByPlaceholderText(/Buscar pieza/i);
const groupTitles = () => screen.queryAllByRole("heading").map((h) => h.textContent);

describe("InteractivePartsTab", () => {
  beforeEach(() => addMutate.mockClear());

  it("lista todas las piezas del modelo agrupadas por categoría al abrir", () => {
    renderTab();
    expect(groupTitles()).toEqual(["Tanque de fumigación", "Hélices"]);
    expect(screen.getByText("Tanque 40L")).toBeInTheDocument();
    expect(screen.getByText("Sensor de nivel")).toBeInTheDocument();
    expect(screen.getByText("Hélice CW")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Todas\s*3/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Tanque de fumigación\s*2/ })).toBeInTheDocument();
  });

  it("busca por nombre sin importar acentos ni mayúsculas", () => {
    renderTab();
    fireEvent.change(search(), { target: { value: "HELICE" } });
    expect(screen.getByText("Hélice CW")).toBeInTheDocument();
    expect(screen.queryByText("Tanque 40L")).not.toBeInTheDocument();
    expect(groupTitles()).toEqual(["Hélices"]);
  });

  it("busca también por el nombre de la categoría", () => {
    renderTab();
    fireEvent.change(search(), { target: { value: "fumigacion" } });
    expect(screen.getByText("Tanque 40L")).toBeInTheDocument();
    expect(screen.getByText("Sensor de nivel")).toBeInTheDocument();
    expect(screen.queryByText("Hélice CW")).not.toBeInTheDocument();
  });

  it("busca por SKU y por número de pieza", () => {
    renderTab();
    fireEvent.change(search(), { target: { value: "t50-002" } });
    expect(screen.getByText("Sensor de nivel")).toBeInTheDocument();
    expect(screen.queryByText("Tanque 40L")).not.toBeInTheDocument();

    fireEvent.change(search(), { target: { value: "yc.he" } });
    expect(screen.getByText("Hélice CW")).toBeInTheDocument();
    expect(screen.queryByText("Sensor de nivel")).not.toBeInTheDocument();
  });

  it("los chips filtran por categoría y sus conteos siguen a la búsqueda", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: /Hélices\s*1/ }));
    expect(groupTitles()).toEqual(["Hélices"]);
    expect(screen.getByRole("checkbox", { name: /Todas/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /Todas/ }));
    expect(groupTitles()).toEqual(["Tanque de fumigación", "Hélices"]);

    fireEvent.change(search(), { target: { value: "sensor" } });
    expect(screen.getByRole("checkbox", { name: /Todas\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Tanque de fumigación\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Hélices\s*0/ })).toBeInTheDocument();
  });

  it("avisa cuando ninguna pieza coincide", () => {
    renderTab();
    fireEvent.change(search(), { target: { value: "no-existe" } });
    expect(screen.getByText(/Ninguna pieza coincide/i)).toBeInTheDocument();
    expect(groupTitles()).toEqual([]);
  });

  it("agrega la pieza a la orden con su categoría", async () => {
    renderTab();
    const card = screen.getByText("Hélice CW").closest("[data-part-card]") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /Agregar a la orden/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toMatchObject({ product: 20, component: 9, quantity: "1" });
  });

  it("sin modelo técnico muestra el aviso en vez de la lista", () => {
    renderTab({ equipment_catalog_model: null });
    expect(screen.getByText(/Sin modelo técnico/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Buscar pieza/i)).not.toBeInTheDocument();
  });
});
