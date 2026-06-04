import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "./ProtectedRoute";
import type { AuthStatus } from "../features/auth/AuthContext";

let mockStatus: AuthStatus = "anonymous";
vi.mock("../features/auth/useAuth", () => ({
  useAuth: () => ({ status: mockStatus, user: null, login: vi.fn(), logout: vi.fn() }),
}));

function renderAt(status: AuthStatus) {
  mockStatus = status;
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>protected content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("ProtectedRoute", () => {
  it("redirige a /login si es anónimo", () => {
    renderAt("anonymous");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renderiza el contenido si está autenticado", () => {
    renderAt("authenticated");
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });
});
