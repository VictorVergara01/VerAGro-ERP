import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LookupManager } from "./LookupManager";

const mut = () => ({ mutateAsync: vi.fn(), isPending: false }) as never;

function renderManager() {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <LookupManager
          items={[
            { id: 1, name: "Hélices" },
            { id: 2, name: "Baterías" },
          ]}
          loading={false}
          save={mut()}
          remove={mut()}
          itemLabel="Categoría"
        />
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("LookupManager", () => {
  it("lista los registros y el campo para agregar", () => {
    renderManager();
    expect(screen.getByText("Hélices")).toBeInTheDocument();
    expect(screen.getByText("Baterías")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nuevo categoría")).toBeInTheDocument();
  });
});
