import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Pagination,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconEdit,
  IconEye,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { useCustomers, useDeleteCustomer } from "./api";
import { CustomerFormModal } from "./CustomerFormModal";
import { CUSTOMER_TYPE_LABEL, type Customer } from "./types";

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = useCustomers({
    search: debounced,
    includeInactive,
    page,
  });
  const del = useDeleteCustomer();

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    open();
  };

  const confirmDelete = (c: Customer) =>
    modals.openConfirmModal({
      title: "Eliminar cliente",
      children: `¿Marcar a "${c.name}" como inactivo?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(c.id);
          notifications.show({ color: "green", message: "Cliente eliminado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<Customer>[] = [
    { header: "Nombre", render: (c) => c.name },
    {
      header: "Tipo",
      render: (c) => CUSTOMER_TYPE_LABEL[c.customer_type ?? "person"],
    },
    { header: "Identificación", render: (c) => c.identification_number || "—" },
    { header: "Teléfono", render: (c) => c.phone || "—" },
    { header: "Correo", render: (c) => c.email || "—" },
    {
      header: "Estado",
      render: (c) => (
        <Badge color={c.is_active ? "green" : "gray"} variant="light">
          {c.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (c) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => navigate(`/customers/${c.id}`)}>
            <IconEye size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={() => openEdit(c)}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(c)}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <Stack>
      <PageHeader
        title="Clientes"
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Nuevo cliente
          </Button>
        }
      />
      <Group justify="space-between">
        <TextInput
          placeholder="Buscar por nombre, identificación, teléfono o correo"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          w={420}
        />
        <Switch
          label="Incluir inactivos"
          checked={includeInactive}
          onChange={(e) => {
            setIncludeInactive(e.currentTarget.checked);
            setPage(1);
          }}
        />
      </Group>

      {error ? (
        <Alert color="red">No se pudieron cargar los clientes.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(c) => c.id}
          emptyText="No hay clientes."
        />
      )}

      {totalPages > 1 && (
        <Group justify="flex-end">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}

      <CustomerFormModal opened={formOpen} onClose={close} customer={editing} />
    </Stack>
  );
}
