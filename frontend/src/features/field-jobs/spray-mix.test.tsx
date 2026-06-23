import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SprayMixModal } from "./SprayMixModal";

const mutateAsync = vi.fn().mockResolvedValue({
  total_caldo_liters: 400, liquid_chemical_liters: 75, water_liters: 325,
  tanks_needed: 2, full_tanks: 2, last_tank_liters: 0,
  products_total: [{ name: "Glifosato", quantity: 75, unit: "L" }],
  per_full_tank: [{ name: "Glifosato", quantity: 37.5, unit: "L" }],
  water_per_full_tank: 162.5,
  last_tank: [],
  water_last_tank: 0,
});
vi.mock("./api", () => ({ useCalculateMix: () => ({ mutateAsync, isPending: false }) }));

describe("SprayMixModal", () => {
  it("muestra el desglose de la mezcla", async () => {
    render(
      <MantineProvider>
        <SprayMixModal
          opened
          onClose={() => {}}
          prefill={{ hectares: 50, caldo_per_hectare: 8, tank_volume_liters: 200,
            products: [{ name: "Glifosato", dose_per_hectare: 1.5, unit: "L/ha" }] }}
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /calcular/i }));
    expect(await screen.findByText(/caldo total/i)).toBeInTheDocument();
    expect(await screen.findByText("37.5 L")).toBeInTheDocument();
  });
});
