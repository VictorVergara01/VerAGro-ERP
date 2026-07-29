import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EquipmentDiagram } from "./EquipmentDiagram";

describe("EquipmentDiagram", () => {
  it("dibuja las zonas del T50 y responde al clic", () => {
    const onZoneSelect = vi.fn();
    render(
      <MantineProvider>
        <EquipmentDiagram modelCode="T50" selectedKeys={new Set()} onZoneSelect={onZoneSelect} />
      </MantineProvider>,
    );
    const tanque = screen.getByRole("button", { name: /Tanque de fumigación/i });
    fireEvent.click(tanque);
    expect(onZoneSelect).toHaveBeenCalledWith("tanque_fumigacion");
  });

  it("resalta la zona seleccionada (aria-pressed)", () => {
    render(
      <MantineProvider>
        <EquipmentDiagram
          modelCode="T50"
          selectedKeys={new Set(["brazos_m1_m2"])}
          onZoneSelect={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole("button", { name: /Brazos M1-M2/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("activa por teclado (Enter)", () => {
    const onZoneSelect = vi.fn();
    render(
      <MantineProvider>
        <EquipmentDiagram modelCode="T50" selectedKeys={new Set()} onZoneSelect={onZoneSelect} />
      </MantineProvider>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /^Hélices$/i }), {
      key: "Enter",
    });
    expect(onZoneSelect).toHaveBeenCalledWith("helices");
  });

  it("muestra un aviso si el modelo no tiene diagrama", () => {
    render(
      <MantineProvider>
        <EquipmentDiagram modelCode="ZZZ" selectedKeys={new Set()} onZoneSelect={vi.fn()} />
      </MantineProvider>,
    );
    expect(screen.getByText(/Sin diagrama/i)).toBeInTheDocument();
  });
});
