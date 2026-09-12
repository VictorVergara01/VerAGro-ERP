import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductFormModal } from "./ProductFormModal";
import type { Product } from "./types";

const saveMutate = vi.fn().mockResolvedValue({});
let categoriesData: Array<Record<string, unknown>> = [];
vi.mock("./api", () => ({
  useSaveProduct: () => ({ mutateAsync: saveMutate, isPending: false }),
  useCategories: () => ({ data: categoriesData }),
  useSupplierOptions: () => ({ data: [] }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({ data: [] }),
}));

const EXISTING_PRODUCT: Product = {
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

function renderModal(product: Product | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <ProductFormModal opened onClose={vi.fn()} product={product} />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("ProductFormModal", () => {
  it("la previa del rango usa el margen de la categoría cuando el producto no tiene margen propio", () => {
    // I3: 0 productos con margen propio y 12 categorías con margen es el caso
    // dominante en la base real; antes del fix la previa ignoraba la cascada y
    // mostraba piso = sugerido = techo = costo promedio.
    categoriesData = [
      {
        id: 3,
        name: "Categoría X",
        min_margin_percentage: "20.00",
        default_margin_percentage: "30.00",
        max_margin_percentage: "45.00",
      },
    ];
    const product: Product = {
      ...EXISTING_PRODUCT,
      category: 3,
      average_cost: "100.00",
      min_margin_percentage: "0.00",
      default_margin_percentage: "0.00",
      max_margin_percentage: "0.00",
    };
    const { baseElement } = renderModal(product);
    categoriesData = [];
    expect(baseElement.textContent).toContain("Rango sobre el costo promedio");
    // costo 100 con margen de categoría 20/30/45 -> piso 120, sugerido 130, techo 145
    expect(baseElement.textContent).toContain("120.00");
    expect(baseElement.textContent).toContain("130.00");
    expect(baseElement.textContent).toContain("145.00");
  });

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

  it("al editar, no reenvía los campos derivados min_sale_price/max_sale_price/average_cost", async () => {
    saveMutate.mockClear();
    renderModal(EXISTING_PRODUCT);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    const payload = saveMutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty("min_sale_price");
    expect(payload).not.toHaveProperty("max_sale_price");
    expect(payload.average_cost).toBeUndefined();
    // Confirma que sí es el camino de edición y que sí viajan los campos editables.
    expect(payload).toMatchObject({
      id: 7,
      min_margin_percentage: "25.00",
      max_margin_percentage: "45.00",
    });
  });

  describe("validación del trío de márgenes (espejo de margin_triplet_errors del backend)", () => {
    function setMargins(min: number, target: number, max: number) {
      fireEvent.change(screen.getByLabelText("Margen mínimo %"), {
        target: { value: String(min) },
      });
      fireEvent.change(screen.getByLabelText("Margen % por defecto"), {
        target: { value: String(target) },
      });
      fireEvent.change(screen.getByLabelText("Margen máximo %"), {
        target: { value: String(max) },
      });
    }

    it("rechaza mínimo > máximo", async () => {
      saveMutate.mockClear();
      renderModal();
      fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "P" } });
      setMargins(50, 0, 30);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(
        await screen.findByText("El margen mínimo no puede superar al máximo."),
      ).toBeInTheDocument();
      expect(saveMutate).not.toHaveBeenCalled();
    });

    it("rechaza mínimo > objetivo (aunque el mínimo no supere al máximo)", async () => {
      saveMutate.mockClear();
      renderModal();
      fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "P" } });
      setMargins(50, 10, 80);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(
        await screen.findByText("El margen mínimo no puede superar al objetivo."),
      ).toBeInTheDocument();
      expect(saveMutate).not.toHaveBeenCalled();
    });

    it("rechaza objetivo > máximo", async () => {
      saveMutate.mockClear();
      renderModal();
      fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "P" } });
      setMargins(0, 50, 30);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(
        await screen.findByText("El margen objetivo no puede superar al máximo."),
      ).toBeInTheDocument();
      expect(saveMutate).not.toHaveBeenCalled();
    });

    it("un margen en 0 no participa en ninguna comparación", async () => {
      saveMutate.mockClear();
      renderModal();
      fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "P" } });
      // target=0 ("no configurado"): ni min>target ni target>max deberían evaluarse,
      // y min(20) <= max(30) tampoco dispara el primer par.
      setMargins(20, 0, 30);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByText(/no puede superar/),
      ).toBeNull();
    });
  });
});
