import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ServiceOrderChecklistCard } from "./ServiceOrderChecklistCard";

const mockChecklists = vi.fn();
vi.mock("./api", () => ({
  useOrderChecklists: () => mockChecklists(),
  useChecklistTemplates: () => ({ data: [{ id: 1, name: "Checklist DJI Agras T50" }] }),
  useInstantiateChecklist: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFillChecklist: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteChecklist: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../inventory/api", () => ({ useProducts: () => ({ data: { results: [] } }) }));

function renderCard() {
  return render(
    <MantineProvider>
      <ServiceOrderChecklistCard orderId={1} editable />
    </MantineProvider>,
  );
}

describe("ServiceOrderChecklistCard", () => {
  it("muestra mensaje cuando no hay checklists", () => {
    mockChecklists.mockReturnValue({ data: [] });
    renderCard();
    expect(screen.getByText("Esta orden no tiene checklists.")).toBeInTheDocument();
  });

  it("muestra un checklist con sus ítems", () => {
    mockChecklists.mockReturnValue({
      data: [
        {
          id: 5,
          template_name: "Checklist DJI Agras T50",
          completed_at: null,
          items: [
            {
              id: 10,
              item_name: "Revisar hélices.",
              status: "pending",
              priority: "",
              recommended_product: null,
            },
          ],
        },
      ],
    });
    renderCard();
    expect(screen.getByText("Revisar hélices.")).toBeInTheDocument();
    expect(screen.getByText("En progreso")).toBeInTheDocument();
  });
});
