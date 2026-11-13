import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { formatCurrency, formatDate } from "../../utils/format";
import { useAuth } from "../auth/useAuth";
import { canRegisterPayments, FINANCIAL_ROLES } from "../auth/roles";
import { useFieldFinance, useFinanceSave, type Earning, type Day, type Expense, type Payment } from "./api";

const CATEGORIES = [
  { value: "fuel", label: "Combustible" }, { value: "parts", label: "Repuestos" },
  { value: "maintenance", label: "Mantenimiento" }, { value: "transport", label: "Transporte" },
  { value: "food", label: "Alimentación y viáticos" }, { value: "other", label: "Otros" },
];
const PAYMENT_METHODS = [{ value: "cash", label: "Efectivo" }, { value: "bank_transfer", label: "Transferencia" }, { value: "yappy", label: "Yappy" }, { value: "other", label: "Otro" }];
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const total = (rows: { amount: string }[]) => rows.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2);

export function FieldFinancePage() {
  const { user } = useAuth();
  if (!FINANCIAL_ROLES.includes(user?.role ?? "")) return <Alert color="yellow">Tu rol no tiene acceso a los gastos y pagos de campo.</Alert>;
  return <FinanceContent writable={canRegisterPayments(user?.role)} />;
}

function FinanceContent({ writable }: { writable: boolean }) {
  const query = useFieldFinance();
  const save = useFinanceSave();
  const [pilot, setPilot] = useState<string | null>(null);
  const [assistant, setAssistant] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [modal, setModal] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [paymentSelection, setPaymentSelection] = useState<{ kind: "pilot" | "assistant"; items: number[]; amount: string; name: string } | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const field = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const open = (kind: string, values: Record<string, string> = {}) => { setError(""); setForm({ date: today(), payment_date: today(), end_time: "16:00", method: "cash", category: "fuel", ...values }); setModal(kind); };
  const toggle = (id: number, ids: number[], setter: (value: number[]) => void) => setter(ids.includes(id) ? ids.filter((n) => n !== id) : [...ids, id]);
  if (query.isLoading) return <Loader />;
  if (query.error || !query.data) return <Alert color="red">No se pudieron cargar los gastos de campo. <Button variant="subtle" onClick={() => void query.refetch()}>Reintentar</Button></Alert>;
  const d = query.data;
  const earnings = d.earnings.filter((row) => String(row.pilot) === pilot);
  const days = d.days.filter((row) => String(row.assistant) === assistant);
  const chosen = earnings.filter((row) => selected.includes(row.id));
  const chosenDays = days.filter((row) => selectedDays.includes(row.id));
  const checkColumn = <T extends { id: number }>(ids: number[], setter: (value: number[]) => void): Column<T> => ({ header: "Pagar", render: (r) => <Checkbox aria-label={`Seleccionar ${r.id}`} checked={ids.includes(r.id)} onChange={() => toggle(r.id, ids, setter)} disabled={!writable} /> });
  const earningColumns: Column<Earning>[] = [
    checkColumn(selected, setSelected), { header: "Trabajo", render: (r) => <Link to={`/field-jobs/${r.job}`}>{r.job_number}</Link> },
    { header: "Cliente", render: (r) => r.customer_name }, { header: "Realizado", render: (r) => formatDate(r.earned_date) },
    { header: "Ha reales", render: (r) => <>{r.hectares}{r.actuals_from_legacy && <Badge color="yellow" size="xs">Datos anteriores</Badge>}</> },
    { header: "Tarifa/ha", render: (r) => formatCurrency(r.rate_per_hectare) }, { header: "Importe", render: (r) => formatCurrency(r.amount) },
  ];
  const dayColumns: Column<Day>[] = [
    checkColumn(selectedDays, setSelectedDays), { header: "Fecha", render: (r) => formatDate(r.date) },
    { header: "Salida", render: (r) => r.end_time.slice(0, 5) }, { header: "Horas extras", render: (r) => (r.overtime_minutes / 60).toFixed(2) },
    { header: "Importe", render: (r) => formatCurrency(r.amount) }, { header: "Notas", render: (r) => r.notes },
    { header: "", render: (r) => writable && <Button variant="subtle" onClick={() => open("day", { id: String(r.id), assistant: String(r.assistant), date: r.date, end_time: r.end_time.slice(0, 5), notes: r.notes })}>Editar</Button> },
  ];
  const expenseColumns: Column<Expense>[] = [
    { header: "Fecha", render: (r) => formatDate(r.date) }, { header: "Categoría", render: (r) => CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category },
    { header: "Concepto", render: (r) => <><Text size="sm">{r.description}</Text><Text size="xs" c="dimmed">{[r.payee, r.receipt_reference].filter(Boolean).join(" · ")}</Text></> },
    { header: "Importe", render: (r) => formatCurrency(r.amount) },
    { header: "Pago", render: (r) => r.payment_date ? <Text size="sm">Pagado {formatDate(r.payment_date)}<br />{r.payment_method} {r.payment_reference}</Text> : <Badge color="yellow">Pendiente</Badge> },
    { header: "", render: (r) => writable && !r.payment_date && <Group gap="xs"><Button variant="subtle" onClick={() => open("expense", { id: String(r.id), date: r.date, category: r.category, description: r.description, payee: r.payee, amount: r.amount, receipt_reference: r.receipt_reference })}>Editar</Button><Button size="xs" onClick={() => open("expense-pay", { id: String(r.id), description: r.description, amount: r.amount })}>Registrar pago</Button></Group> },
  ];
  const startPayment = (kind: "pilot" | "assistant") => {
    const rows = kind === "pilot" ? chosen : chosenDays;
    const name = kind === "pilot" ? earnings[0]?.pilot_name : days[0]?.assistant_name;
    setPaymentSelection({ kind, items: rows.map((r) => r.id), amount: total(rows), name: name || "" });
    open("payment");
  };
  const submit = async () => {
    setError("");
    let path = "", body: unknown = {}, method = "POST";
    if (modal === "pilot") {
      path = "field-pilots/";
      body = { name: form.name, phone: form.phone || "", rate_per_hectare: form.rate };
    } else if (modal === "rate") {
      const existing = d.rates.find((r) => String(r.pilot) === form.pilot);
      path = `field-pilot-rates/${existing ? `${existing.id}/` : ""}`;
      method = existing ? "PATCH" : "POST";
      body = { pilot: Number(form.pilot), rate_per_hectare: form.rate };
    } else if (modal === "assistant") {
      path = "field-assistants/"; body = { name: form.name };
    } else if (modal === "day") {
      path = `field-assistant-days/${form.id ? `${form.id}/` : ""}`; method = form.id ? "PATCH" : "POST";
      body = { assistant: Number(form.assistant), date: form.date, end_time: form.end_time, notes: form.notes || "" };
    } else if (modal === "expense") {
      path = `field-expenses/${form.id ? `${form.id}/` : ""}`; method = form.id ? "PATCH" : "POST";
      body = { date: form.date, category: form.category, description: form.description, amount: form.amount, payee: form.payee || "", receipt_reference: form.receipt_reference || "" };
    } else if (modal === "expense-pay") {
      path = `field-expenses/${form.id}/pay/`; body = { payment_date: form.payment_date, method: form.method, reference: form.reference || "" };
    } else if (modal === "assign") {
      path = "field-pilot-earnings/assign/"; body = { job: Number(form.job), pilot: Number(form.pilot) };
    } else if (paymentSelection) {
      path = "field-payments/";
      body = { kind: paymentSelection.kind, items: paymentSelection.items, expected_amount: paymentSelection.amount, payment_date: form.payment_date, method: form.method, reference: form.reference || "", notes: form.notes || "" };
    }
    try {
      await save.mutateAsync({ path, body, method });
      setModal(""); setSelected([]); setSelectedDays([]);
      notifications.show({ color: "green", message: "Registro guardado." });
    } catch (e) { setError((e as Error).message); }
  };
  const hours = Math.max(0, Number(form.end_time?.slice(0, 2) || 16) * 60 + Number(form.end_time?.slice(3, 5) || 0) - 960) / 60;

  return <Stack>
    <PageHeader title="Gastos de campo" />
    <Text c="dimmed">Pilotos por hectárea real, jornadas de asistentes y gastos generales sin asignación a una operación.</Text>
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      {[["Costos registrados", d.summary.total_cost], ["Pagos realizados", d.summary.paid_in_period], ["Pendiente de pagar", d.summary.pending_cost]].map(([label, amount]) => <Card withBorder key={String(label)}><Text c="dimmed" size="sm">{label}</Text><Text fw={700} fz={24}>{formatCurrency(amount)}</Text></Card>)}
    </SimpleGrid>
    <Text size="sm" component={Link} to="/reports">Ver resultados por período en Reportes → Trabajos de campo.</Text>
    {!!d.summary.unpriced_jobs.length && <Alert color="yellow" title="Trabajos sin costo de piloto">
      <Text size="sm">Hay {d.summary.unpriced_jobs.length} trabajos cerrados sin tarifa o piloto. El costo total está incompleto hasta registrarlos. Configurar una tarifa incorpora los trabajos anteriores pendientes con esa tarifa.</Text>
      {writable && d.summary.unpriced_jobs.map((job) => <Group key={job.id} mt="xs"><Text size="sm">{job.number} · {job.actual_hectares ?? "Sin área real"} ha · {job.pilot__name || "Sin piloto"}</Text><Button size="xs" variant="light" onClick={() => open("assign", { job: String(job.id), pilot: String(job.pilot_id || "") })}>Asignar piloto y tarifa</Button></Group>)}
    </Alert>}
    <Tabs defaultValue="pilots" keepMounted={false}>
      <Tabs.List><Tabs.Tab value="pilots">Pilotos</Tabs.Tab><Tabs.Tab value="assistants">Asistentes</Tabs.Tab><Tabs.Tab value="expenses">Gastos generales</Tabs.Tab><Tabs.Tab value="history">Liquidaciones pagadas</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="pilots" pt="md"><Stack>
        <Group><Select label="Piloto" placeholder="Selecciona un piloto" searchable clearable value={pilot} onChange={(value) => { setPilot(value); setSelected([]); }} data={d.pilots.map((p) => ({ value: String(p.id), label: `${p.name}${d.rates.find((r) => r.pilot === p.id) ? ` · ${formatCurrency(d.rates.find((r) => r.pilot === p.id)!.rate_per_hectare)}/ha` : " · Sin tarifa"}` }))} />{writable && <><Button onClick={() => open("pilot")}>Registrar piloto</Button><Button variant="light" onClick={() => open("rate", { pilot: pilot || "", rate: d.rates.find((r) => String(r.pilot) === pilot)?.rate_per_hectare || "" })}>Configurar tarifa</Button></>}</Group>
        <Text size="sm">Los trabajos aparecen al cerrarlos. Cada trabajo conserva su tarifa; cambiarla solo afecta los trabajos futuros o todavía sin costo registrado.</Text>
        <Group><Button variant="subtle" disabled={!earnings.length} onClick={() => setSelected(chosen.length === earnings.length ? [] : earnings.map((r) => r.id))}>Seleccionar todos / ninguno</Button><Text>{chosen.length} trabajos · {formatCurrency(total(chosen))}</Text>{writable && <Button disabled={!chosen.length} onClick={() => startPayment("pilot")}>Pagar trabajos seleccionados</Button>}</Group>
        <DataTable columns={earningColumns} rows={earnings} rowKey={(r) => r.id} emptyText={pilot ? "Sin trabajos pendientes de pago." : "Selecciona un piloto; configura su tarifa si aún no aparece."} />
      </Stack></Tabs.Panel>
      <Tabs.Panel value="assistants" pt="md"><Stack>
        <Group><Select label="Asistente" value={assistant} onChange={(value) => { setAssistant(value); setSelectedDays([]); }} searchable clearable data={d.assistants.map((a) => ({ value: String(a.id), label: a.name }))} />{writable && <><Button variant="light" onClick={() => open("assistant")}>Registrar asistente</Button><Button disabled={!assistant} onClick={() => open("day", { assistant: assistant || "" })}>Registrar jornada</Button></>}</Group>
        <Text size="sm">$20 por día hasta las 4:00 p. m. Más $3 por hora extra, proporcional a los minutos.</Text>
        <Group><Button variant="subtle" disabled={!days.length} onClick={() => setSelectedDays(chosenDays.length === days.length ? [] : days.map((r) => r.id))}>Seleccionar todos / ninguno</Button><Text>{chosenDays.length} jornadas · {formatCurrency(total(chosenDays))}</Text>{writable && <Button disabled={!chosenDays.length} onClick={() => startPayment("assistant")}>Pagar jornadas seleccionadas</Button>}</Group>
        <DataTable columns={dayColumns} rows={days} rowKey={(r) => r.id} emptyText="Sin jornadas pendientes para este asistente." />
      </Stack></Tabs.Panel>
      <Tabs.Panel value="expenses" pt="md"><Stack>
        <Group justify="space-between"><Text>Gastos generales del área de campo</Text>{writable && <Button onClick={() => open("expense")}>Registrar gasto</Button>}</Group>
        <Text size="sm" c="dimmed">Registra el costo una sola vez. El pago posterior no vuelve a sumar el gasto. Para repuestos, registra el costo del consumo; no dupliques la compra de la misma pieza.</Text>
        <DataTable columns={expenseColumns} rows={d.expenses} rowKey={(r) => r.id} emptyText="Sin gastos registrados." />
      </Stack></Tabs.Panel>
      <Tabs.Panel value="history" pt="md"><DataTable<Payment> columns={[
        { header: "Pago", render: (p) => `CAM-${p.id}` }, { header: "Fecha", render: (p) => formatDate(p.payment_date) },
        { header: "Persona", render: (p) => p.beneficiary }, { header: "Tipo", render: (p) => p.kind === "pilot" ? "Piloto" : "Asistente" },
        { header: "Importe", render: (p) => formatCurrency(p.amount) }, { header: "Método / referencia", render: (p) => `${PAYMENT_METHODS.find((m) => m.value === p.method)?.label || p.method} ${p.reference}` },
        { header: "", render: (p) => <Button variant="subtle" onClick={() => setReceipt(p)}>Ver detalle</Button> },
      ]} rows={d.payments} rowKey={(p) => p.id} emptyText="Sin liquidaciones pagadas." /></Tabs.Panel>
    </Tabs>
    <Modal opened={!!modal} onClose={() => { if (!save.isPending) setModal(""); }} title={{ pilot: "Registrar piloto", rate: "Tarifa del piloto", assistant: "Registrar asistente", day: "Jornada del asistente", expense: "Gasto general de campo", "expense-pay": "Registrar pago del gasto", payment: "Confirmar liquidación", assign: "Asignar piloto al trabajo" }[modal]}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}><Stack>
        {error && <Alert color="red">{error}</Alert>}
        {modal === "pilot" && <>
          <TextInput label="Nombre del piloto" required value={form.name || ""} onChange={(e) => field("name", e.currentTarget.value)} />
          <TextInput label="Teléfono" value={form.phone || ""} onChange={(e) => field("phone", e.currentTarget.value)} />
          <NumberInput label="Tarifa por hectárea ($)" required min={0.01} decimalScale={2} value={form.rate || ""} onChange={(v) => field("rate", String(v))} />
          <Text size="sm" c="dimmed">El piloto se registra como personal de campo. No necesita correo, contraseña ni cuenta de acceso.</Text>
        </>}
        {(modal === "rate" || modal === "assign") && <>
          <Select label="Piloto" required searchable value={form.pilot || null} onChange={(v) => field("pilot", v || "")} data={(modal === "assign" ? d.pilots.filter((u) => d.rates.some((r) => r.pilot === u.id)) : d.pilots).map((u) => ({ value: String(u.id), label: u.name }))} />
          {modal === "rate" && <><NumberInput label="Tarifa por hectárea ($)" required min={0.01} decimalScale={2} value={form.rate || ""} onChange={(v) => field("rate", String(v))} /><Text size="sm">Los trabajos anteriores que aún no tengan costo registrado se incorporan con esta tarifa. Los importes ya guardados se conservan.</Text></>}
        </>}
        {modal === "assistant" && <TextInput label="Nombre del asistente" required value={form.name || ""} onChange={(e) => field("name", e.currentTarget.value)} />}
        {modal === "day" && <>
          <Select label="Asistente" required value={form.assistant || null} onChange={(v) => field("assistant", v || "")} data={d.assistants.filter((a) => a.is_active).map((a) => ({ value: String(a.id), label: a.name }))} />
          <TextInput label="Fecha de la jornada" type="date" required max={today()} value={form.date} onChange={(e) => field("date", e.currentTarget.value)} />
          <TextInput label="Hora de salida" type="time" min="16:00" required value={form.end_time} onChange={(e) => field("end_time", e.currentTarget.value)} />
          <Text>Base $20 + {hours.toFixed(2)} horas extras × $3 = <b>{formatCurrency(20 + hours * 3)}</b></Text>
          <Textarea label="Notas" value={form.notes || ""} onChange={(e) => field("notes", e.currentTarget.value)} />
        </>}
        {modal === "expense" && <>
          <TextInput label="Fecha del gasto" type="date" required max={today()} value={form.date} onChange={(e) => field("date", e.currentTarget.value)} />
          <Select label="Categoría" required data={CATEGORIES} value={form.category} onChange={(v) => field("category", v || "other")} />
          <TextInput label="Concepto" required value={form.description || ""} onChange={(e) => field("description", e.currentTarget.value)} />
          <NumberInput label="Importe ($)" min={0.01} decimalScale={2} required value={form.amount || ""} onChange={(v) => field("amount", String(v))} />
          <TextInput label="Proveedor o beneficiario" value={form.payee || ""} onChange={(e) => field("payee", e.currentTarget.value)} />
          <TextInput label="Número o referencia del comprobante" value={form.receipt_reference || ""} onChange={(e) => field("receipt_reference", e.currentTarget.value)} />
        </>}
        {(modal === "payment" || modal === "expense-pay") && <>
          <Alert color="blue">{modal === "payment" ? `${paymentSelection?.name} · ${paymentSelection?.items.length} registros` : form.description}<br /><b>{formatCurrency(modal === "payment" ? paymentSelection?.amount : form.amount)}</b><br />Confirma después de realizar el pago. El registro quedará cerrado.</Alert>
          <TextInput label="Fecha de pago" type="date" max={today()} required value={form.payment_date} onChange={(e) => field("payment_date", e.currentTarget.value)} />
          <Select label="Método de pago" required data={PAYMENT_METHODS} value={form.method} onChange={(v) => field("method", v || "cash")} />
          <TextInput label="Referencia del pago" value={form.reference || ""} onChange={(e) => field("reference", e.currentTarget.value)} />
          {modal === "payment" && <Textarea label="Notas del pago" value={form.notes || ""} onChange={(e) => field("notes", e.currentTarget.value)} />}
        </>}
        <Button type="submit" loading={save.isPending}>{modal === "payment" || modal === "expense-pay" ? "Confirmar pago realizado" : "Guardar"}</Button>
      </Stack></form>
    </Modal>
    <Modal opened={!!receipt} onClose={() => setReceipt(null)} title={`Liquidación CAM-${receipt?.id}`} size="lg">
      {receipt && <Stack><Text fw={600}>{receipt.beneficiary} · {formatCurrency(receipt.amount)}</Text><Text>{formatDate(receipt.payment_date)} · {receipt.method} · {receipt.reference}</Text>
        {receipt.pilot_earnings.map((r) => <Text key={r.id}>{r.job_number} · {r.hectares} ha × {formatCurrency(r.rate_per_hectare)} = {formatCurrency(r.amount)}</Text>)}
        {receipt.assistant_days.map((r) => <Text key={r.id}>{formatDate(r.date)} · salida {r.end_time.slice(0, 5)} · {formatCurrency(r.amount)}</Text>)}<Text>{receipt.notes}</Text></Stack>}
    </Modal>
  </Stack>;
}
