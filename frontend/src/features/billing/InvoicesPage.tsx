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

import { InvoiceCreateModal } from "./InvoiceCreateModal";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { formatCurrency, formatDate } from "../../utils/format";
import { useInvoices } from "./api";
import {
  INVOICE_STATUS_COLOR,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_LABEL,
  type Invoice,
} from "./types";

export function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = useInvoices({
    search: debounced,
    status: status || undefined,
    page,
  });

  const columns: Column<Invoice>[] = [
    { header: "N.º", render: (i) => i.invoice_number },
    {
      header: "Tipo",
      render: (i) => INVOICE_TYPE_LABEL[i.invoice_type ?? "service_invoice"],
    },
    { header: "Cliente", render: (i) => i.customer_name ?? "—" },
    {
      header: "Estado",
      render: (i) => (
        <Badge color={INVOICE_STATUS_COLOR[i.status ?? "draft"]} variant="light">
          {INVOICE_STATUS_LABEL[i.status ?? "draft"]}
        </Badge>
      ),
    },
    { header: "Fecha", render: (i) => formatDate(i.issue_date) },
    { header: "Total", align: "right", render: (i) => formatCurrency(i.total) },
    { header: "Saldo", align: "right", render: (i) => formatCurrency(i.balance_due) },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Stack>
      <PageHeader
        title="Facturas"
        subtitle="Facturas de servicio y venta de productos."
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={open}>
            Nueva factura
          </Button>
        }
      />

      {error ? (
        <Alert color="red">No se pudieron cargar las facturas.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(i) => i.id}
          emptyText="No hay facturas."
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
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
                data={INVOICE_STATUS_OPTIONS}
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

      <InvoiceCreateModal opened={createOpen} onClose={close} />
    </Stack>
  );
}
