import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SprayMixModal } from "./SprayMixModal";

const mutateAsync = vi.fn().mockResolvedValue({
  total_volume_liters: 96, fills_needed: 4, full_fills: 3, last_fill_liters: 6,
  per_full_fill: [{ name: "Glifosato", quantity: 240, unit: "mL" }],
  last_fill: [{ name: "Glifosato", quantity: 48, unit: "mL" }],
});
vi.mock("./api", () => ({ useCalculateMix: () => ({ mutateAsync, isPending: false }) }));

describe("SprayMixModal", () => {
  it("muestra el resultado del cálculo", async () => {
    render(
      <MantineProvider>
        <SprayMixModal opened onClose={() => {}} prefill={{ hectares: 12, water_per_hectare: 8, tank_volume_liters: 30 }} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /calcular/i }));
    expect(await screen.findByText(/4 llenados/i)).toBeInTheDocument();
    expect(await screen.findByText("240 mL")).toBeInTheDocument();
  });
});
