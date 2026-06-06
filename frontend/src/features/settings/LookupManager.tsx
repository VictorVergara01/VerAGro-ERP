import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
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

const marginOf = (item: LookupItem | null) => {
  const value = (item as { default_margin_percentage?: string | number } | null)
    ?.default_margin_percentage;
  return value != null ? String(value) : "0";
};

export function LookupManager<T extends LookupItem>({
  items,
  loading,
  save,
  remove,
  itemLabel,
  withMargin = false,
}: {
  items: T[];
  loading: boolean;
  save: UseMutationResult<
    unknown,
    Error,
    { id?: number; name: string; default_margin_percentage?: string }
  >;
  remove: UseMutationResult<unknown, Error, number>;
  itemLabel: string;
  withMargin?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newMargin, setNewMargin] = useState<string>("0");
  const [editing, setEditing] = useState<T | null>(null);
  const [editName, setEditName] = useState("");
  const [editMargin, setEditMargin] = useState<string>("0");
  const [editOpen, { open, close }] = useDisclosure(false);

  useEffect(() => {
    if (editing) {
      setEditName(editing.name);
      setEditMargin(marginOf(editing));
    }
  }, [editing]);

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await save.mutateAsync({
        name: newName.trim(),
        ...(withMargin ? { default_margin_percentage: newMargin || "0" } : {}),
      });
      notifications.show({ color: "green", message: `${itemLabel} creado.` });
      setNewName("");
      setNewMargin("0");
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const submitEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      await save.mutateAsync({
        id: editing.id,
        name: editName.trim(),
        ...(withMargin ? { default_margin_percentage: editMargin || "0" } : {}),
      });
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
    ...(withMargin
      ? [
          {
            header: "Margen %",
            align: "right" as const,
            render: (i: T) => `${marginOf(i)}%`,
          },
        ]
      : []),
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
        {withMargin && (
          <NumberInput
            placeholder="Margen %"
            value={newMargin}
            onChange={(v) => setNewMargin(String(v))}
            min={0}
            decimalScale={2}
            w={140}
          />
        )}
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
          {withMargin && (
            <NumberInput
              label="Margen %"
              value={editMargin}
              onChange={(v) => setEditMargin(String(v))}
              min={0}
              decimalScale={2}
            />
          )}
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
