import {
  Alert,
  Badge,
  Button,
  Group,
  Pagination,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { QuoteCreateModal } from "./QuoteCreateModal";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { formatCurrency, formatDate } from "../../utils/format";
import { useQuotes } from "./api";
import {
  QUOTE_STATUS_COLOR,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_OPTIONS,
  type Quote,
} from "./types";

export function QuotesPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuotes({
    search: debounced,
    status: status || undefined,
    page,
  });

  const columns: Column<Quote>[] = [
    { header: "N.º", render: (q) => q.quote_number },
    { header: "Cliente", render: (q) => q.customer_name ?? "—" },
    {
      header: "Estado",
      render: (q) => (
        <Badge color={QUOTE_STATUS_COLOR[q.status ?? "draft"]} variant="light">
          {QUOTE_STATUS_LABEL[q.status ?? "draft"]}
        </Badge>
      ),
    },
    { header: "Fecha", render: (q) => formatDate(q.issue_date) },
    { header: "Total", align: "right", render: (q) => formatCurrency(q.total) },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Stack>
      <PageHeader
        title="Cotizaciones"
        subtitle="Presupuestos enviados a clientes."
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={open}>
            Nueva cotización
          </Button>
        }
      />

      {error ? (
        <Alert color="red">No se pudieron cargar las cotizaciones.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(q) => q.id}
          emptyText="No hay cotizaciones."
          onRowClick={(q) => navigate(`/quotes/${q.id}`)}
          toolbar={
            <Group>
              <TextInput
                placeholder="Buscar por número"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                w={300}
              />
              <Select
                placeholder="Estado"
                data={QUOTE_STATUS_OPTIONS}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                clearable
                w={200}
              />
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

      <QuoteCreateModal opened={createOpen} onClose={close} />
    </Stack>
  );
}
