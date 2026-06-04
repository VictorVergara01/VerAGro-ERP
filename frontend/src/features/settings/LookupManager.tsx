import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { DataTable, type Column } from "../../components/ui/DataTable";

interface LookupItem {
  id: number;
  name: string;
}

export function LookupManager<T extends LookupItem>({
  items,
  loading,
  save,
  remove,
  itemLabel,
}: {
  items: T[];
  loading: boolean;
  save: UseMutationResult<unknown, Error, { id?: number; name: string }>;
  remove: UseMutationResult<unknown, Error, number>;
  itemLabel: string;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<T | null>(null);
  const [editName, setEditName] = useState("");
  const [editOpen, { open, close }] = useDisclosure(false);

  useEffect(() => {
    if (editing) setEditName(editing.name);
  }, [editing]);

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await save.mutateAsync({ name: newName.trim() });
      notifications.show({ color: "green", message: `${itemLabel} creado.` });
      setNewName("");
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const submitEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      await save.mutateAsync({ id: editing.id, name: editName.trim() });
      notifications.show({ color: "green", message: "Guardado." });
      close();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmDelete = (item: T) =>
    modals.openConfirmModal({
      title: `Eliminar ${itemLabel.toLowerCase()}`,
      children: `¿Eliminar "${item.name}"?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(item.id);
          notifications.show({ color: "green", message: "Eliminado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<T>[] = [
    { header: "Nombre", render: (i) => i.name },
    {
      header: "",
      align: "right",
      render: (i) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            onClick={() => {
              setEditing(i);
              open();
            }}
          >
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(i)}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  return (
    <Stack>
      <Group>
        <TextInput
          placeholder={`Nuevo ${itemLabel.toLowerCase()}`}
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          w={320}
        />
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={add}
          loading={save.isPending}
        >
          Agregar
        </Button>
      </Group>
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        rowKey={(i) => i.id}
        emptyText="Sin registros."
      />
      <Modal opened={editOpen} onClose={close} title={`Editar ${itemLabel.toLowerCase()}`}>
        <Stack>
          <TextInput
            label="Nombre"
            value={editName}
            onChange={(e) => setEditName(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancelar
            </Button>
            <Button onClick={submitEdit} loading={save.isPending}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
