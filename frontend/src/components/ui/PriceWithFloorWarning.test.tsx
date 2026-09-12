import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PriceWithFloorWarning } from "./PriceWithFloorWarning";

function renderPrice(props: {
  value: string;
  floor: string | null;
  belowMin: unknown;
}) {
  return render(
    <MantineProvider>
      <PriceWithFloorWarning {...props} />
    </MantineProvider>,
  );
}

describe("PriceWithFloorWarning", () => {
  it("marca en rojo con tooltip cuando está bajo el piso", async () => {
    renderPrice({ value: "30.00", floor: "34.38", belowMin: true });
    const price = await screen.findByText(/30\.00/);
    expect(price).toHaveStyle({ color: "var(--mantine-color-red-text)" });
    await userEvent.hover(price);
    expect(await screen.findByText(/bajo el mínimo/i)).toBeInTheDocument();
    expect(await screen.findByText(/34\.38/)).toBeInTheDocument();
  });

  it("no marca el precio cuando está por encima del piso", () => {
    renderPrice({ value: "50.00", floor: "34.38", belowMin: false });
    expect(screen.getByText(/50\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/bajo el mínimo/i)).not.toBeInTheDocument();
  });

  it("no marca el precio cuando no hay piso definido", () => {
    renderPrice({ value: "50.00", floor: null, belowMin: false });
    expect(screen.getByText(/50\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/bajo el mínimo/i)).not.toBeInTheDocument();
  });
});
