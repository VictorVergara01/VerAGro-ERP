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

  it("muestra el trío de márgenes (mínimo / objetivo / máximo) de una categoría", () => {
    render(
      <MantineProvider>
        <ModalsProvider>
          <LookupManager
            items={[
              {
                id: 1,
                name: "Hélices",
                min_margin_percentage: "20",
                default_margin_percentage: "30",
                max_margin_percentage: "45",
              },
            ]}
            loading={false}
            save={mut()}
            remove={mut()}
            itemLabel="Categoría"
            withMargin
          />
        </ModalsProvider>
      </MantineProvider>,
    );
    // Antes del fix, la columna sólo mostraba mín/máx ("20% – 45%") y escondía
    // el margen objetivo, que en la base real es el único configurado en 11/12
    // categorías.
    expect(screen.getByText("20% / 30% / 45%")).toBeInTheDocument();
  });
});
