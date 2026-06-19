import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserFormModal } from "./UserFormModal";

function renderModal(props: Partial<React.ComponentProps<typeof UserFormModal>> = {}) {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <UserFormModal
          opened
          onClose={vi.fn()}
          editing={props.editing ?? null}
          currentRole={props.currentRole ?? "general_admin"}
          onSubmit={props.onSubmit ?? vi.fn()}
          submitting={false}
        />
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe("UserFormModal", () => {
  it("exige contraseña al crear (campo presente, sin placeholder de 'dejar vacío')", () => {
    renderModal({ editing: null });
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/dejar vac/i),
    ).not.toBeInTheDocument();
  });

  it("en edición la contraseña es opcional (placeholder 'dejar vacío')", () => {
    renderModal({
      editing: { id: 1, email: "a@v.com", full_name: "A", role: "technician", is_active: true },
    });
    expect(screen.getByPlaceholderText(/dejar vac/i)).toBeInTheDocument();
  });

  it("oculta el rol super_admin para un general_admin", () => {
    renderModal({ currentRole: "general_admin" });
    expect(screen.queryByText("Super Administrador")).not.toBeInTheDocument();
  });

  it("muestra el rol super_admin para un super_admin", () => {
    renderModal({ currentRole: "super_admin" });
    expect(screen.getByText("Super Administrador")).toBeInTheDocument();
  });
});
