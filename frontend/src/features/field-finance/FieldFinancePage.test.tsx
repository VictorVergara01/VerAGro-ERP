import { MantineProvider } from "@mantine/core";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldFinancePage } from "./FieldFinancePage";

const mutation = vi.fn();
const role = vi.fn();
const query = vi.fn();
vi.mock("./api", () => ({ useFieldFinance: () => query(), useFinanceSave: () => ({ mutateAsync: mutation, isPending: false }) }));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: role() } }) }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

const data = {
  rates: [{ id: 1, pilot: 5, pilot_name: "Piloto Uno", rate_per_hectare: "2.50" }],
  assistants: [{ id: 9, name: "Asistente Uno", is_active: true }],
  earnings: [
    { id: 11, job: 31, job_number: "TC-31", customer_name: "Cliente Uno", pilot: 5, pilot_name: "Piloto Uno", earned_date: "2026-01-01", hectares: "8.5", rate_per_hectare: "2.50", amount: "21.25", payment: null },
    { id: 12, job: 32, job_number: "TC-32", customer_name: "Cliente Dos", pilot: 5, pilot_name: "Piloto Uno", earned_date: "2026-01-02", hectares: "10", rate_per_hectare: "2.50", amount: "25.00", payment: null },
  ],
  days: [], payments: [], pilots: [{ id: 5, name: "Piloto Uno", phone: "", is_active: true }],
  expenses: [{ id: 4, date: "2026-01-01", category: "fuel", description: "Gasolina del generador", amount: "40.00", payee: "Estación", receipt_reference: "REC-1", payment_date: null }],
  summary: { total_cost: 100, paid_in_period: 20, pending_cost: 80, unpriced_jobs: [] },
};
function renderPage() {
  return render(<MemoryRouter><MantineProvider><FieldFinancePage /></MantineProvider></MemoryRouter>);
}
beforeEach(() => {
  role.mockReturnValue("accounting");
  mutation.mockReset().mockResolvedValue({});
  query.mockReturnValue({ isLoading: false, error: null, data });
});

describe("Gastos de campo", () => {
  it("registra un piloto con nombre y tarifa sin crear una cuenta de acceso", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Registrar piloto" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Nombre del piloto/), "Juan Pérez");
    fireEvent.change(within(dialog).getByLabelText(/Tarifa por hectárea/), { target: { value: "2.50" } });
    expect(within(dialog).queryByLabelText(/correo|contraseña/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ path: "field-pilots/", body: { name: "Juan Pérez", phone: "", rate_per_hectare: "2.5" } }));
  });

  it("liquida solo los trabajos elegidos y muestra el importe antes de confirmar", async () => {
    const user = userEvent.setup();
    renderPage();
    fireEvent.click(screen.getByRole("combobox", { name: "Piloto" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText(/Piloto Uno/));
    expect(screen.getByText("TC-31")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Seleccionar 11"));
    await user.click(screen.getByRole("button", { name: "Pagar trabajos seleccionados" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/1 registros/)).toBeInTheDocument();
    expect(within(dialog).getByText(/21.25/)).toBeInTheDocument();
    expect(mutation).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pago realizado" }));
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ path: "field-payments/", body: expect.objectContaining({ kind: "pilot", items: [11], expected_amount: "21.25", method: "cash" }) }));
  });

  it("calcula la jornada de 18:30 en $27.50 y guarda la hora de salida", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "Asistentes" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Asistente" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Asistente Uno"));
    await user.click(screen.getByRole("button", { name: "Registrar jornada" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Hora de salida", { exact: false }), { target: { value: "18:30" } });
    expect(within(dialog).getByText(/27.50/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ path: "field-assistant-days/", body: expect.objectContaining({ assistant: 9, end_time: "18:30" }) }));
  });

  it("registra el pago de un gasto existente sin crear otro gasto", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "Gastos generales" }));
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirmar pago realizado" }));
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ path: "field-expenses/4/pay/", body: expect.objectContaining({ method: "cash" }) }));
  });

  it("ventas puede consultar sin botones para pagar", () => {
    role.mockReturnValue("sales");
    renderPage();
    expect(screen.getByText("Gastos de campo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurar tarifa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar trabajos seleccionados" })).not.toBeInTheDocument();
  });

  it("impide consultar finanzas con rol de piloto", () => {
    role.mockReturnValue("piloto");
    query.mockClear();
    renderPage();
    expect(screen.getByText(/Tu rol no tiene acceso/)).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("avisa si faltan costos de piloto", () => {
    query.mockReturnValue({ isLoading: false, data: { ...data, summary: { ...data.summary, unpriced_jobs: [{ id: 1, number: "TC-1", actual_hectares: "10", pilot_id: null }] } } });
    renderPage();
    expect(screen.getByText("Trabajos sin costo de piloto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asignar piloto y tarifa" })).toBeInTheDocument();
  });
});
