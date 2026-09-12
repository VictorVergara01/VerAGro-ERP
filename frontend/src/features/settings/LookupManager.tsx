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
import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { DataTable, type Column } from "../../components/ui/DataTable";

interface LookupItem {
  id: number;
  name: string;
}

const MARGIN_FIELDS = [
  { key: "default_margin_percentage", label: "Margen % por defecto" },
  { key: "min_margin_percentage", label: "Margen mínimo %" },
  { key: "max_margin_percentage", label: "Margen máximo %" },
] as const;

type MarginKey = (typeof MARGIN_FIELDS)[number]["key"];

type SaveMutation = UseMutationResult<
  unknown,
  Error,
  { id?: number; name: string } & Partial<Record<MarginKey, string>>
>;

const marginOf = (item: LookupItem | null, key: MarginKey) => {
  const value = (item as unknown as Record<string, string | number | undefined> | null)?.[
    key
  ];
  return value != null ? String(value) : "0";
};

const emptyMargins = () =>
  Object.fromEntries(MARGIN_FIELDS.map((f) => [f.key, "0"])) as Record<MarginKey, string>;

/** 0 (o vacío) significa "no configurado": no se pinta como si fuera un margen real. */
const fmtMargin = (raw: string) => (Number(raw) > 0 ? `${raw}%` : "—");

const marginsOf = (item: LookupItem | null) =>
  Object.fromEntries(
    MARGIN_FIELDS.map((f) => [f.key, marginOf(item, f.key)]),
  ) as Record<MarginKey, string>;

/**
 * Cuerpo del formulario de edición. Recibe `key={editing?.id ?? "new"}` desde el padre
 * para que React lo remonte con los valores correctos en vez de sincronizar el estado
 * desde `editing` con un useEffect.
 */
function EditForm({
  item,
  withMargin,
  save,
  onClose,
}: {
  item: LookupItem | null;
  withMargin: boolean;
  save: SaveMutation;
  onClose: () => void;
}) {
  const [editName, setEditName] = useState(item?.name ?? "");
  const [editMargins, setEditMargins] = useState<Record<MarginKey, string>>(marginsOf(item));

  const submitEdit = async () => {
    if (!item || !editName.trim()) return;
    try {
      await save.mutateAsync({
        id: item.id,
        name: editName.trim(),
        ...(withMargin
          ? Object.fromEntries(
              MARGIN_FIELDS.map((f) => [f.key, editMargins[f.key] || "0"]),
            )
          : {}),
      });
      notifications.show({ color: "green", message: "Guardado." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Stack>
      <TextInput
        label="Nombre"
        value={editName}
        onChange={(e) => setEditName(e.currentTarget.value)}
      />
      {withMargin &&
        MARGIN_FIELDS.map((f) => (
          <NumberInput
            key={f.key}
            label={f.label}
            value={editMargins[f.key]}
            onChange={(v) => setEditMargins((prev) => ({ ...prev, [f.key]: String(v) }))}
            min={0}
            decimalScale={2}
          />
        ))}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submitEdit} loading={save.isPending}>
          Guardar
        </Button>
      </Group>
    </Stack>
  );
}

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
  save: SaveMutation;
  remove: UseMutationResult<unknown, Error, number>;
  itemLabel: string;
  withMargin?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newMargins, setNewMargins] = useState<Record<MarginKey, string>>(emptyMargins);
  const [editing, setEditing] = useState<T | null>(null);
  const [editOpen, { open, close }] = useDisclosure(false);

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await save.mutateAsync({
        name: newName.trim(),
        ...(withMargin
          ? Object.fromEntries(
              MARGIN_FIELDS.map((f) => [f.key, newMargins[f.key] || "0"]),
            )
          : {}),
      });
      notifications.show({ color: "green", message: `${itemLabel} creado.` });
      setNewName("");
      setNewMargins(emptyMargins());
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
            header: "Margen % (mín / objetivo / máx)",
            align: "right" as const,
            render: (i: T) =>
              `${fmtMargin(marginOf(i, "min_margin_percentage"))} / ` +
              `${fmtMargin(marginOf(i, "default_margin_percentage"))} / ` +
              `${fmtMargin(marginOf(i, "max_margin_percentage"))}`,
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
        {withMargin &&
          MARGIN_FIELDS.map((f) => (
            <NumberInput
              key={f.key}
              placeholder={f.label}
              value={newMargins[f.key]}
              onChange={(v) => setNewMargins((prev) => ({ ...prev, [f.key]: String(v) }))}
              min={0}
              decimalScale={2}
              w={140}
            />
          ))}
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
        <EditForm
          key={editing?.id ?? "new"}
          item={editing}
          withMargin={withMargin}
          save={save}
          onClose={close}
        />
      </Modal>
    </Stack>
  );
}
