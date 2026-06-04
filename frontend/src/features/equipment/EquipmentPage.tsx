import {
  ActionIcon,
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
import {
  useDeleteEquipment,
  useEquipmentList,
  useEquipmentTypes,
} from "./api";
import { EquipmentFormModal } from "./EquipmentFormModal";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_OPTIONS,
  type Equipment,
} from "./types";

export function EquipmentPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [formOpen, { open, close }] = useDisclosure(false);
  const navigate = useNavigate();

  const types = useEquipmentTypes();
  const { data, isLoading, error } = useEquipmentList({
    search: debounced,
    status: status || undefined,
    equipmentType: typeId ? Number(typeId) : undefined,
    page,
  });
  const del = useDeleteEquipment();

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (e: Equipment) => {
    setEditing(e);
    open();
  };

  const confirmDelete = (e: Equipment) =>
    modals.openConfirmModal({
      title: "Retirar equipo",
      children: `¿Marcar "${e.name}" como retirado?`,
      labels: { confirm: "Retirar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(e.id);
          notifications.show({ color: "green", message: "Equipo retirado." });
        } catch (err) {
          notifications.show({ color: "red", message: (err as Error).message });
        }
      },
    });

  const columns: Column<Equipment>[] = [
    { header: "Nombre", render: (e) => e.name },
    { header: "Tipo", render: (e) => e.equipment_type_name ?? "—" },
    { header: "Cliente", render: (e) => e.customer_name ?? "Empresa" },
    { header: "N.º serie", render: (e) => e.serial_number || "—" },
    {
      header: "Estado",
      render: (e) => (
        <Badge color={STATUS_COLOR[e.status ?? "active"]} variant="light">
          {STATUS_LABEL[e.status ?? "active"]}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (e) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => navigate(`/equipment/${e.id}`)}>
            <IconEye size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={() => openEdit(e)}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(e)}>
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
        title="Equipos"
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Nuevo equipo
          </Button>
        }
      />
      <Group>
        <TextInput
          placeholder="Buscar por nombre, serie, código, marca o modelo"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          w={380}
        />
        <Select
          placeholder="Estado"
          data={STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          clearable
          w={180}
        />
        <Select
          placeholder="Tipo"
          data={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
          value={typeId}
          onChange={(v) => {
            setTypeId(v);
            setPage(1);
          }}
          clearable
          searchable
          w={180}
        />
      </Group>

      {error ? (
        <Alert color="red">No se pudieron cargar los equipos.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          loading={isLoading}
          rowKey={(e) => e.id}
          emptyText="No hay equipos."
        />
      )}

      {totalPages > 1 && (
        <Group justify="flex-end">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}

      <EquipmentFormModal opened={formOpen} onClose={close} equipment={editing} />
    </Stack>
  );
}
