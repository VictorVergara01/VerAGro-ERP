import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompleteFieldJobModal } from "./CompleteFieldJobModal";
import type { FieldJob } from "./types";

const { complete } = vi.hoisted(() => ({ complete: vi.fn().mockResolvedValue({}) }));
vi.mock("./api", () => ({ useCompleteFieldJob: () => ({ mutateAsync: complete, isPending: false }) }));

function showJob(unit = "qq") {
  return render(<MantineProvider><CompleteFieldJobModal onClose={vi.fn()} job={{
    id: 1, job_type: "spreading", billing_unit: unit, hectares: "10", planned_quintals: "30",
    estimated_quintals: "30", unit_price: unit === "qq" ? "15" : "25",
  } as FieldJob} /></MantineProvider>);
}

describe("CompleteFieldJobModal", () => {
  it("cobra los 26 qq aplicados directamente aunque se programaron 30", async () => {
    complete.mockClear();
    showJob();
    expect(screen.getByLabelText(/Hectáreas realmente trabajadas/)).toHaveDisplayValue("");
    fireEvent.change(screen.getByLabelText(/Hectáreas realmente trabajadas/), { target: { value: "8.5" } });
    fireEvent.change(screen.getByLabelText(/Quintales realmente aplicados/), { target: { value: "26" } });
    expect(screen.getByText(/390\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar trabajo realizado" }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith({ actual_hectares: "8.5", applied_quintals: "26", done_date: undefined }));
  });

  it("cobra 8.5 ha a $25 sin exigir qq para semilla de pasto", async () => {
    complete.mockClear();
    showJob("ha");
    fireEvent.change(screen.getByLabelText(/Hectáreas realmente trabajadas/), { target: { value: "8.5" } });
    expect(screen.getByText(/212\.50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar trabajo realizado" }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith({ actual_hectares: "8.5", applied_quintals: null, done_date: undefined }));
  });

  it("exige las cantidades reales sin reutilizar automáticamente las previstas", () => {
    complete.mockClear();
    showJob();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar trabajo realizado" }));
    expect(complete).not.toHaveBeenCalled();
  });
});
