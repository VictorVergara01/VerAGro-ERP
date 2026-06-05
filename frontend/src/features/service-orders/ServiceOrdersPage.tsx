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

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { formatCurrency, formatDate } from "../../utils/format";
import { useServiceOrders } from "./api";
import { ServiceOrderFormModal } from "./ServiceOrderFormModal";
import {
  SERVICE_TYPE_LABEL,
  SO_STATUS_COLOR,
  SO_STATUS_LABEL,
  SO_STATUS_OPTIONS,
  type ServiceOrder,
} from "./types";

export function ServiceOrdersPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [formOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = useServiceOrders({
    search: debounced,
    status: status || undefined,
    page,
  });

  const columns: Column<ServiceOrder>[] = [
    { header: "N.º", render: (o) => o.service_order_number },
    { header: "Cliente", render: (o) => o.customer_name ?? "—" },
    { header: "Equipo", render: (o) => o.equipment_name || "—" },
    {
      header: "Tipo",
      render: (o) => SERVICE_TYPE_LABEL[o.service_type ?? "diagnostic"],
    },
    {
      header: "Estado",
      render: (o) => (
        <Badge color={SO_STATUS_COLOR[o.status ?? "received"]} variant="light">
          {SO_STATUS_LABEL[o.status ?? "received"]}
        </Badge>
      ),
    },
    { header: "Recibida", render: (o) => formatDate(o.received_date) },
    { header: "Total", align: "right", render: (o) => formatCurrency(o.total_amount) },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Stack>
      <PageHeader
        title="Órdenes de servicio"
        subtitle="Diagnóstico, reparación y entrega de equipos."
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={open}>
            Nueva orden
          </Button>
        }
      />

      {error ? (
        <Alert color="red">No se pudieron cargar las órdenes.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(o) => o.id}
          emptyText="No hay órdenes de servicio."
          onRowClick={(o) => navigate(`/service-orders/${o.id}`)}
          toolbar={
            <Group>
              <TextInput
                placeholder="Buscar por número o reclamo"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                w={340}
              />
              <Select
                placeholder="Estado"
                data={SO_STATUS_OPTIONS}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                clearable
                searchable
                w={220}
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

      <ServiceOrderFormModal opened={formOpen} onClose={close} order={null} />
    </Stack>
  );
}
