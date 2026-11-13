import { MantineProvider } from "@mantine/core";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldAccountPanel } from "./FieldAccountPanel";
import { FieldCollectionsPage, FieldReceivablesPanel } from "./FieldCollectionsPage";

const save = vi.fn(), account = vi.fn(), list = vi.fn(), role = vi.fn();
vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  useFieldAccount: () => account(),
  useSaveCollection: () => ({ mutateAsync: save, isPending: false }),
  useFieldAccounts: (filters: unknown) => { list(filters); return { isLoading: false, data: { items: [data], summary: { total: "100", collected: "30", balance_due: "70", overdue: "70" } } }; },
}));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: role() } }) }));

const data = {
  id: 7, number: "TC-7", customer: 1, customer_name: "Finca Uno", pilot: 2, pilot_name: "Piloto Uno",
  job_type: "fumigation", done_date: "2026-01-01", due_date: "2026-01-11", total: "100", collected: "30", balance_due: "70",
  collection_status: "overdue", days_overdue: 20, invoice: null,
  collections: [{ id: 8, amount: "30", payment_date: "2026-01-02", method: "cash", reference: "REC-1", notes: "Primer abono", recorded_by: "Administración" }],
};
function renderWithProviders(node: React.ReactNode) {
  return render(<MemoryRouter><MantineProvider>{node}</MantineProvider></MemoryRouter>);
}
beforeEach(() => {
  role.mockReturnValue("accounting");
  save.mockReset().mockResolvedValue({});
  account.mockReturnValue({ isLoading: false, error: null, data });
  list.mockClear();
});

describe("Cobros de campo", () => {
  it("muestra deuda, vencimiento e historial sin exigir factura", () => {
    renderWithProviders(<FieldAccountPanel jobId={7} />);
    expect(screen.getByText(/sin generar una factura/)).toBeInTheDocument();
    expect(screen.getByText("COB-8")).toBeInTheDocument();
    expect(screen.getByText("REC-1")).toBeInTheDocument();
    expect(screen.getByText(/20 días de atraso/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar abono o cobro" })).toBeInTheDocument();
  });

  it("confirma un abono con el saldo revisado y reutiliza la clave si hay que reintentar", async () => {
    save.mockRejectedValueOnce(new Error("No se pudo confirmar la respuesta"));
    const user = userEvent.setup();
    renderWithProviders(<FieldAccountPanel jobId={7} />);
    await user.click(screen.getByRole("button", { name: "Registrar abono o cobro" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Importe recibido/), { target: { value: "40" } });
    await user.type(within(dialog).getByLabelText("Referencia del cobro"), "REC-2");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar dinero recibido" }));
    expect(await within(dialog).findByText("No se pudo confirmar la respuesta")).toBeInTheDocument();
    const first = save.mock.calls[0][0];
    expect(first).toEqual({ action: "collect", body: expect.objectContaining({ amount: "40", expected_balance: "70", method: "cash", reference: "REC-2", request_id: expect.any(String) }) });
    await user.click(within(dialog).getByRole("button", { name: "Confirmar dinero recibido" }));
    expect(save.mock.calls[1][0].body.request_id).toBe(first.body.request_id);
  });

  it("permite corregir el vencimiento sin registrar otro cobro", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FieldAccountPanel jobId={7} />);
    await user.click(screen.getByRole("button", { name: "Cambiar vencimiento" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Fecha de vencimiento"), { target: { value: "2026-12-01" } });
    await user.click(within(dialog).getByRole("button", { name: "Guardar vencimiento" }));
    expect(save).toHaveBeenCalledWith({ action: "terms", body: { due_date: "2026-12-01" } });
  });

  it("ventas consulta el historial pero no registra dinero recibido", () => {
    role.mockReturnValue("sales");
    renderWithProviders(<FieldAccountPanel jobId={7} />);
    expect(screen.getByText("COB-8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar abono o cobro" })).not.toBeInTheDocument();
  });

  it("el listado conserva filtros y enlaza al trabajo para cobrar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FieldReceivablesPanel range={{ from: "2026-01-01" }} />);
    expect(screen.getByRole("link", { name: "Ver y cobrar" })).toHaveAttribute("href", "/field-jobs/7#cobros");
    await user.type(screen.getByLabelText("Buscar trabajo, cliente o piloto"), "Finca");
    expect(list).toHaveBeenLastCalledWith({ from: "2026-01-01", search: "Finca", collection_status: "" });
  });

  it("no consulta cuentas financieras para un técnico", () => {
    role.mockReturnValue("technician");
    renderWithProviders(<FieldCollectionsPage />);
    expect(screen.getByText(/Tu rol no tiene acceso/)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});
