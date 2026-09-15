import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FieldPlotFormModal } from "./FieldPlotFormModal";

vi.mock("./api", () => ({
  useSaveFieldPlot: () => ({ mutateAsync: saveMutate, isPending: false }),
}));

let saveMutate: (...args: unknown[]) => unknown = vi.fn();

function renderForm({ save = vi.fn().mockResolvedValue({}) }: { save?: (...args: unknown[]) => unknown } = {}) {
  saveMutate = save;
  return render(
    <MantineProvider>
      <FieldPlotFormModal opened onClose={() => {}} customerId={1} plot={null} />
    </MantineProvider>,
  );
}

describe("FieldPlotFormModal", () => {
  it("muestra los campos del lote", () => {
    renderForm();
    expect(screen.getByLabelText(/nombre del lote/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hectáreas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tasa de aplicación/i)).toBeInTheDocument();
  });

  it("revela el texto de cultivo al elegir Otros", () => {
    renderForm();
    expect(screen.queryByLabelText(/especifica el cultivo/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^cultivo$/i), { target: { value: "other" } });
    expect(screen.getByLabelText(/especifica el cultivo/i)).toBeInTheDocument();
  });

  it("permite agregar químicos y corta en 10 con el texto del lote", () => {
    renderForm();
    const addBtn = screen.getByRole("button", { name: /agregar químico/i });
    for (let i = 0; i < 10; i++) fireEvent.click(addBtn);
    expect(addBtn).toBeDisabled();
    expect(screen.getByText(/máximo 10 químicos por lote/i)).toBeInTheDocument();
  });

  it("envía el payload con la forma que espera el serializer", async () => {
    const save = vi.fn().mockResolvedValue({});
    renderForm({ save });

    await userEvent.type(screen.getByLabelText(/nombre del lote/i), "Potrero 1");
    await userEvent.type(screen.getByLabelText(/ubicación/i), "Entrada norte");
    await userEvent.clear(screen.getByLabelText(/hectáreas/i));
    await userEvent.type(screen.getByLabelText(/hectáreas/i), "15");
    await userEvent.type(screen.getByLabelText(/tasa de aplicación/i), "20");

    await userEvent.click(screen.getByRole("button", { name: /agregar químico/i }));
    await userEvent.type(screen.getByPlaceholderText(/nombre del químico/i), "Glifosato");
    await userEvent.type(screen.getByPlaceholderText(/dosis\/ha/i), "10");

    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      id: undefined,
      customer: 1,
      name: "Potrero 1",
      hectares: "15",
      crop: "rice",
      crop_other: "",
      location: "Entrada norte",
      water_per_hectare: "20",
      notes: "",
      products: [{ name: "Glifosato", dose_per_hectare: "10", unit: "L/ha" }],
    });
  });
});
