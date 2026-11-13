import { Alert, Badge, Card, Group, Loader, Select, SimpleGrid, Stack, Text, TextInput, Button } from "@mantine/core";
import { Link } from "react-router-dom";
import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { formatCurrency, formatDate } from "../../utils/format";
import { useAuth } from "../auth/useAuth";
import { FINANCIAL_ROLES } from "../auth/roles";
import { COLLECTION_STATUS, useFieldAccounts, type AccountFilters, type FieldAccount } from "./api";

export function FieldReceivablesPanel({ range = {} }: { range?: AccountFilters }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const query = useFieldAccounts({ ...range, search, collection_status: status || "" });
  return <Stack>
    <Group><TextInput label="Buscar trabajo, cliente o piloto" value={search} onChange={(e) => setSearch(e.currentTarget.value)} /><Select clearable label="Estado de cobro" value={status} onChange={(value) => setStatus(value == null ? null : String(value))} data={Object.entries(COLLECTION_STATUS).map(([value, label]) => ({ value, label }))} /></Group>
    <Text c="dimmed" size="sm">Incluye trabajos realizados, tengan o no factura. Las fechas filtran la realización del trabajo; los saldos muestran lo pendiente actualmente.</Text>
    {query.isLoading && <Loader />}
    {query.error && <Alert color="red">No se pudieron cargar las cuentas de campo.</Alert>}
    {query.data && <>
      <SimpleGrid cols={{ base: 1, sm: 4 }}>{[["Servicios realizados", query.data.summary.total], ["Cobrado de estos trabajos", query.data.summary.collected], ["Pendiente de cobrar", query.data.summary.balance_due], ["Saldo vencido", query.data.summary.overdue]].map(([label, value]) => <Card withBorder key={String(label)}><Text c="dimmed" size="sm">{label}</Text><Text fw={700} fz={24}>{formatCurrency(value)}</Text></Card>)}</SimpleGrid>
      <DataTable<FieldAccount> columns={[
        { header: "Trabajo", render: (r) => r.number }, { header: "Cliente", render: (r) => r.customer_name }, { header: "Piloto", render: (r) => r.pilot_name },
        { header: "Realizado", render: (r) => formatDate(r.done_date) }, { header: "Vencimiento", render: (r) => formatDate(r.due_date) },
        { header: "Importe", render: (r) => formatCurrency(r.total) }, { header: "Cobrado", render: (r) => formatCurrency(r.collected) }, { header: "Saldo", render: (r) => formatCurrency(r.balance_due) },
        { header: "Estado", render: (r) => <Badge color={r.collection_status === "overdue" ? "red" : r.collection_status === "paid" ? "green" : "yellow"}>{COLLECTION_STATUS[r.collection_status]}{r.days_overdue > 0 ? ` · ${r.days_overdue} días` : ""}</Badge> },
        { header: "", render: (r) => <Button component={Link} to={`/field-jobs/${r.id}#cobros`} variant="subtle">Ver y cobrar</Button> },
      ]} rows={query.data.items} rowKey={(r) => r.id} emptyText="Sin trabajos realizados que coincidan con los filtros." />
    </>}
  </Stack>;
}

export function FieldCollectionsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!FINANCIAL_ROLES.includes(user?.role || "")) return <Alert color="yellow">Tu rol no tiene acceso a los cobros de campo.</Alert>;
  return <Stack><PageHeader title="Cobros de campo" /><Group><TextInput type="date" label="Trabajos desde" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /><TextInput type="date" label="Trabajos hasta" value={to} onChange={(e) => setTo(e.currentTarget.value)} /></Group><FieldReceivablesPanel range={{ from, to }} /></Stack>;
}
