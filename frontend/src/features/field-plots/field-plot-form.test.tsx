import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldPlotFormModal } from "./FieldPlotFormModal";

vi.mock("./api", () => ({
  useSaveFieldPlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderForm() {
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
});
