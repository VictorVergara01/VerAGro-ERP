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
    const arm = screen.getByRole("button", { name: /Brazo M1/i });
    fireEvent.click(arm);
    expect(onZoneSelect).toHaveBeenCalledWith("arm_m1");
  });

  it("resalta la zona seleccionada (aria-pressed)", () => {
    render(
      <MantineProvider>
        <EquipmentDiagram
          modelCode="T50"
          selectedKeys={new Set(["arm_m1"])}
          onZoneSelect={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole("button", { name: /Brazo M1/i })).toHaveAttribute(
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
    fireEvent.keyDown(screen.getByRole("button", { name: /Sistema de pulverización/i }), {
      key: "Enter",
    });
    expect(onZoneSelect).toHaveBeenCalledWith("spray");
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
