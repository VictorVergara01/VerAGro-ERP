import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EquipmentComponentTree } from "./EquipmentComponentTree";
import type { ComponentTreeNode } from "../despieceTypes";

const nodes: ComponentTreeNode[] = [
  {
    id: 1, code: "propulsion", name: "Sistema de propulsión", component_type: "assembly",
    diagram_key: "propulsion", position: "", sort_order: 0,
    children: [
      {
        id: 2, code: "arm_m1", name: "Brazo M1", component_type: "assembly",
        diagram_key: "arm_m1", position: "", sort_order: 0,
        children: [
          { id: 3, code: "motor_m1", name: "Motor M1", component_type: "position",
            diagram_key: "motor_m1", position: "", sort_order: 0, children: [] },
        ],
      },
    ],
  },
];

function renderTree(selectedId: number | null = null) {
  const onSelect = vi.fn();
  render(
    <MantineProvider>
      <EquipmentComponentTree nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
    </MantineProvider>,
  );
  return onSelect;
}

describe("EquipmentComponentTree", () => {
  it("renderiza los conjuntos raíz", () => {
    renderTree();
    expect(screen.getByText("Sistema de propulsión")).toBeInTheDocument();
  });

  it("al hacer clic en un nodo llama onSelect con su id", () => {
    const onSelect = renderTree();
    fireEvent.click(screen.getByText("Sistema de propulsión"));
    expect(onSelect).toHaveBeenCalledWith(1, expect.objectContaining({ code: "propulsion" }));
  });
});
