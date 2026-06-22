import { Alert, Badge, Button, Group, Pagination, Select, Stack, TextInput } from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { formatCurrency, formatDate } from "../../utils/format";
import { canWriteService } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { useFieldJobs } from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";
import {
  FJ_STATUS_COLOR,
  FJ_STATUS_LABEL,
  FJ_STATUS_OPTIONS,
  type FieldJob,
} from "./types";

export function FieldJobsPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading, error } = useFieldJobs({
    search: debounced,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
  });

  const columns: Column<FieldJob>[] = [
    { header: "N.º", render: (j) => j.number },
    { header: "Cliente", render: (j) => j.customer_name ?? "—" },
    { header: "Finca", render: (j) => j.location || "—" },
    { header: "Programado", render: (j) => formatDate(j.scheduled_date) },
    { header: "Ha", align: "right", render: (j) => `${j.hectares} ha` },
    { header: "Total", align: "right", render: (j) => formatCurrency(j.total) },
    {
      header: "Estado",
      render: (j) => (
        <Badge color={FJ_STATUS_COLOR[j.status ?? "scheduled"]} variant="light">
          {FJ_STATUS_LABEL[j.status ?? "scheduled"]}
        </Badge>
      ),
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const resetPage = () => setPage(1);

  return (
    <Stack>
      <PageHeader
        title="Trabajos de campo"
        subtitle="Fumigación con drones."
        action={
          canWriteService(user?.role) ? (
            <Button leftSection={<IconPlus size={18} />} onClick={open}>Nuevo trabajo</Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert color="red">No se pudieron cargar los trabajos.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(j) => j.id}
          emptyText="No hay trabajos de campo."
          onRowClick={(j) => navigate(`/field-jobs/${j.id}`)}
          toolbar={
            <Group>
              <TextInput
                placeholder="Buscar por número, finca o cliente"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => { setSearch(e.currentTarget.value); resetPage(); }}
                w={300}
              />
              <Select placeholder="Estado" data={FJ_STATUS_OPTIONS} value={status}
                onChange={(v) => { setStatus(v); resetPage(); }} clearable w={160} />
              <TextInput type="date" aria-label="Desde" value={from}
                onChange={(e) => { setFrom(e.currentTarget.value); resetPage(); }} />
              <TextInput type="date" aria-label="Hasta" value={to}
                onChange={(e) => { setTo(e.currentTarget.value); resetPage(); }} />
            </Group>
          }
          footer={
            totalPages > 1 ? (
              <Group justify="flex-end">
                <Pagination value={page} onChange={setPage} total={totalPages} />
              </Group>
            ) : undefined
          }
        />
      )}

      <FieldJobFormModal opened={formOpen} onClose={close} job={null} />
    </Stack>
  );
}
