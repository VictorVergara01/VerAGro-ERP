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
import { useDeleteSupplier, useSuppliers } from "./api";
import { SupplierFormModal } from "./SupplierFormModal";
import type { Supplier } from "./types";

export function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const { data, isLoading, error } = useSuppliers({
    search: debounced,
    includeInactive,
    page,
  });
  const del = useDeleteSupplier();

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    open();
  };

  const confirmDelete = (s: Supplier) =>
    modals.openConfirmModal({
      title: "Eliminar proveedor",
      children: `¿Marcar "${s.name}" como inactivo?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(s.id);
          notifications.show({ color: "green", message: "Proveedor eliminado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<Supplier>[] = [
    { header: "Nombre", render: (s) => s.name },
    { header: "Contacto", render: (s) => s.contact_person || "—" },
    { header: "País", render: (s) => s.country || "—" },
    { header: "Teléfono", render: (s) => s.phone || "—" },
    { header: "Correo", render: (s) => s.email || "—" },
    {
      header: "Estado",
      render: (s) => (
        <Badge color={s.is_active ? "green" : "gray"} variant="light">
          {s.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (s) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => navigate(`/suppliers/${s.id}`)}>
            <IconEye size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={() => openEdit(s)}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(s)}>
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
        title="Proveedores"
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Nuevo proveedor
          </Button>
        }
      />
      <Group justify="space-between">
        <TextInput
          placeholder="Buscar por nombre, razón social, correo o contacto"
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
        <Alert color="red">No se pudieron cargar los proveedores.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(s) => s.id}
          emptyText="No hay proveedores."
        />
      )}

      {totalPages > 1 && (
        <Group justify="flex-end">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}

      <SupplierFormModal opened={formOpen} onClose={close} supplier={editing} />
    </Stack>
  );
}
