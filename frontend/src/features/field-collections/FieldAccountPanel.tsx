import { Alert, Badge, Button, Card, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { canRegisterPayments } from "../auth/roles";
import { DataTable } from "../../components/ui/DataTable";
import { formatCurrency, formatDate } from "../../utils/format";
import { COLLECTION_METHODS, COLLECTION_STATUS, localToday, useFieldAccount, useSaveCollection, type Collection } from "./api";

export function FieldAccountPanel({ jobId }: { jobId: number }) {
  const { user } = useAuth();
  const query = useFieldAccount(jobId);
  const save = useSaveCollection(jobId);
  const [modal, setModal] = useState<"collect" | "terms" | null>(null);
  const [form, setForm] = useState({ amount: "", payment_date: localToday(), method: "cash", reference: "", notes: "", due_date: "", request_id: "", expected_balance: "" });
  const [error, setError] = useState("");
  if (query.isLoading) return <Loader />;
  if (query.error || !query.data) return <Alert color="red">No se pudo cargar la cuenta de este trabajo. <Button variant="subtle" onClick={() => void query.refetch()}>Reintentar</Button></Alert>;
  const data = query.data;
  const field = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const open = (kind: "collect" | "terms") => {
    setError("");
    setForm({ amount: String(data.balance_due), payment_date: localToday(), method: "cash", reference: "", notes: "", due_date: data.due_date || "", request_id: crypto.randomUUID(), expected_balance: String(data.balance_due) });
    setModal(kind);
  };
  const submit = async () => {
    if (!modal) return;
    try {
      await save.mutateAsync({ action: modal, body: modal === "terms" ? { due_date: form.due_date || null } : { amount: form.amount, payment_date: form.payment_date, method: form.method, reference: form.reference, notes: form.notes, request_id: form.request_id, expected_balance: form.expected_balance } });
      setModal(null);
    } catch (e) { setError((e as Error).message); }
  };
  return <Card withBorder id="cobros"><Stack>
    <Group justify="space-between"><Text fw={600}>Cobros del trabajo</Text><Badge color={data.collection_status === "paid" ? "green" : data.collection_status === "overdue" ? "red" : "yellow"}>{COLLECTION_STATUS[data.collection_status]}</Badge></Group>
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      {[["Importe del servicio", data.total], ["Cobrado", data.collected], ["Saldo pendiente", data.balance_due]].map(([label, value]) => <div key={String(label)}><Text c="dimmed" size="sm">{label}</Text><Text fw={700} fz={24}>{formatCurrency(value)}</Text></div>)}
    </SimpleGrid>
    <Group><Text size="sm">Vencimiento: {data.due_date ? formatDate(data.due_date) : "Sin vencimiento"}{data.days_overdue > 0 ? ` · ${data.days_overdue} días de atraso` : ""}</Text><Button variant="subtle" size="xs" onClick={() => open("terms")}>Cambiar vencimiento</Button></Group>
    {data.invoice ? <Text size="sm" component={Link} to={`/invoices/${data.invoice.id}`}>Factura vinculada: {data.invoice.number}</Text> : <Text size="sm" c="dimmed">Puedes registrar abonos y cobrar este trabajo sin generar una factura.</Text>}
    {canRegisterPayments(user?.role) && Number(data.balance_due) > 0 && <Group><Button onClick={() => open("collect")}>Registrar abono o cobro</Button></Group>}
    <DataTable<Collection> columns={[
      { header: "Comprobante", render: (r) => `COB-${r.id}` }, { header: "Fecha", render: (r) => formatDate(r.payment_date) },
      { header: "Importe", render: (r) => formatCurrency(r.amount) }, { header: "Método", render: (r) => COLLECTION_METHODS.find((m) => m.value === r.method)?.label || r.method },
      { header: "Referencia", render: (r) => r.reference || "—" }, { header: "Notas", render: (r) => r.notes || "—" }, { header: "Registrado por", render: (r) => r.recorded_by || "—" },
    ]} rows={data.collections || []} rowKey={(r) => r.id} emptyText="Sin cobros registrados." />
    <Modal opened={modal !== null} onClose={() => { if (!save.isPending) setModal(null); }} title={modal === "collect" ? "Registrar abono o cobro" : "Vencimiento del trabajo"}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}><Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Text>{data.number} · {data.customer_name}</Text>
        {modal === "collect" ? <>
          <Alert color="blue">Saldo pendiente: {formatCurrency(form.expected_balance)}. Registra únicamente dinero ya recibido.</Alert>
          <NumberInput required label="Importe recibido ($)" min={0.01} max={Number(form.expected_balance)} decimalScale={2} value={form.amount} onChange={(v) => field("amount", String(v))} />
          <TextInput required label="Fecha del cobro" type="date" min={data.done_date} max={localToday()} value={form.payment_date} onChange={(e) => field("payment_date", e.currentTarget.value)} />
          <Select required label="Método de cobro" data={COLLECTION_METHODS} value={form.method} onChange={(v) => field("method", v || "cash")} />
          <TextInput label="Referencia del cobro" maxLength={100} value={form.reference} onChange={(e) => field("reference", e.currentTarget.value)} />
          <Textarea label="Notas del cobro" value={form.notes} onChange={(e) => field("notes", e.currentTarget.value)} />
        </> : <TextInput label="Fecha de vencimiento" description="Puedes dejarla vacía si no hay fecha acordada." type="date" min={data.done_date} value={form.due_date} onChange={(e) => field("due_date", e.currentTarget.value)} />}
        <Button type="submit" loading={save.isPending}>{modal === "collect" ? "Confirmar dinero recibido" : "Guardar vencimiento"}</Button>
      </Stack></form>
    </Modal>
  </Stack></Card>;
}
