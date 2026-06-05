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
import { usePurchaseOrders } from "./api";
import { PurchaseOrderCreateModal } from "./PurchaseOrderCreateModal";
import { PO_STATUS_COLOR, PO_STATUS_LABEL, PO_STATUS_OPTIONS, type PurchaseOrder } from "./types";

export function PurchasingPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = usePurchaseOrders({
    search: debounced,
    status: status || undefined,
    page,
  });

  const columns: Column<PurchaseOrder>[] = [
    { header: "N.º", render: (o) => o.order_number },
    { header: "Proveedor", render: (o) => o.supplier_name ?? "—" },
    { header: "Fecha", render: (o) => formatDate(o.order_date) },
    {
      header: "Estado",
      render: (o) => (
        <Badge color={PO_STATUS_COLOR[o.status ?? "draft"]} variant="light">
          {PO_STATUS_LABEL[o.status ?? "draft"]}
        </Badge>
      ),
    },
    { header: "Total", align: "right", render: (o) => formatCurrency(o.grand_total) },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Stack>
      <PageHeader
        title="Compras"
        subtitle="Órdenes de compra y recepción de inventario."
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
          emptyText="No hay órdenes de compra."
          onRowClick={(o) => navigate(`/purchasing/${o.id}`)}
          toolbar={
            <Group>
              <TextInput
                placeholder="Buscar por número o notas"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                w={320}
              />
              <Select
                placeholder="Estado"
                data={PO_STATUS_OPTIONS}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                clearable
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

      <PurchaseOrderCreateModal opened={createOpen} onClose={close} />
    </Stack>
  );
}
