import { ActionIcon, Badge, Button, Group, Switch, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { useAuth } from "../auth/useAuth";
import { ROLE_LABELS } from "../auth/roles";
import { UserFormModal } from "./UserFormModal";
import { useDeleteUser, useSaveUser, useUsers, type UserAccount, type UserInput } from "./api";

export function UsersManager() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const list = useUsers({ search: debounced, includeInactive });
  const save = useSaveUser();
  const remove = useDeleteUser();

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (u: UserAccount) => {
    setEditing(u);
    setModalOpen(true);
  };

  const submit = async (input: UserInput) => {
    try {
      await save.mutateAsync(input);
      notifications.show({ color: "green", message: "Usuario guardado." });
      setModalOpen(false);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmDeactivate = (u: UserAccount) =>
    modals.openConfirmModal({
      title: "Desactivar usuario",
      children: `¿Desactivar a "${u.full_name || u.email}"? Podrás reactivarlo después.`,
      labels: { confirm: "Desactivar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(u.id);
          notifications.show({ color: "green", message: "Usuario desactivado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<UserAccount>[] = [
    { header: "Nombre", render: (u) => u.full_name || "—" },
    { header: "Email", render: (u) => u.email },
    { header: "Rol", render: (u) => <Badge variant="light">{ROLE_LABELS[u.role] ?? u.role}</Badge> },
    {
      header: "Estado",
      render: (u) => (
        <Badge color={u.is_active ? "green" : "gray"} variant="light">
          {u.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (u) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon variant="subtle" aria-label="Editar usuario" onClick={() => openEdit(u)}>
            <IconEdit size={18} />
          </ActionIcon>
          {u.is_active && u.id !== user?.id && (
            <ActionIcon variant="subtle" color="red" aria-label="Desactivar usuario" onClick={() => confirmDeactivate(u)}>
              <IconTrash size={18} />
            </ActionIcon>
          )}
        </Group>
      ),
    },
  ];

  return (
    <>
      <Group justify="space-between" mb="md">
        <Group>
          <TextInput
            placeholder="Buscar por nombre o email"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={300}
          />
          <Switch
            label="Incluir inactivos"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.currentTarget.checked)}
          />
        </Group>
        <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
          Nuevo usuario
        </Button>
      </Group>
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.isLoading}
        rowKey={(u) => u.id}
        emptyText="Sin usuarios."
      />
      <UserFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        currentRole={user?.role}
        submitting={save.isPending}
        onSubmit={submit}
      />
    </>
  );
}
