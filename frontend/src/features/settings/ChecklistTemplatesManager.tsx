import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { useEquipmentTypes } from "../equipment/api";
import {
  useCreateTemplate,
  useDeleteTemplate,
  useTemplateList,
  type ChecklistTemplate,
} from "./api";

function CreateTemplateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const create = useCreateTemplate();
  const types = useEquipmentTypes();
  const [name, setName] = useState("");
  const [equipmentType, setEquipmentType] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [itemsText, setItemsText] = useState("");

  const submit = async () => {
    if (!name.trim()) {
      notifications.show({ color: "red", message: "El nombre es obligatorio." });
      return;
    }
    const items = itemsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => ({ name: l, order: i + 1, is_required: true }));
    try {
      await create.mutateAsync({
        name: name.trim(),
        equipment_type: equipmentType ? Number(equipmentType) : null,
        description,
        items,
      });
      notifications.show({ color: "green", message: "Plantilla creada." });
      setName("");
      setEquipmentType(null);
      setDescription("");
      setItemsText("");
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nueva plantilla de checklist" size="lg">
      <Stack>
        <TextInput
          label="Nombre"
          withAsterisk
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Select
          label="Tipo de equipo"
          data={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
          value={equipmentType}
          onChange={(v) => setEquipmentType(v)}
          searchable
          clearable
        />
        <TextInput
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Textarea
          label="Ítems (uno por línea)"
          autosize
          minRows={5}
          placeholder={"Revisar hélices.\nRevisar motores.\n…"}
          value={itemsText}
          onChange={(e) => setItemsText(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Crear
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function ChecklistTemplatesManager() {
  const list = useTemplateList();
  const del = useDeleteTemplate();
  const [open, { open: openModal, close }] = useDisclosure(false);

  const confirmDelete = (t: ChecklistTemplate) =>
    modals.openConfirmModal({
      title: "Eliminar plantilla",
      children: `¿Eliminar "${t.name}"?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(t.id);
          notifications.show({ color: "green", message: "Plantilla eliminada." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<ChecklistTemplate>[] = [
    { header: "Nombre", render: (t) => t.name },
    { header: "Ítems", align: "right", render: (t) => (t.items ?? []).length },
    {
      header: "",
      align: "right",
      render: (t) => (
        <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(t)}>
          <IconTrash size={18} />
        </ActionIcon>
      ),
    },
  ];

  return (
    <Stack>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={18} />} onClick={openModal}>
          Nueva plantilla
        </Button>
      </Group>
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.isLoading}
        rowKey={(t) => t.id}
        emptyText="Sin plantillas."
      />
      <CreateTemplateModal opened={open} onClose={close} />
    </Stack>
  );
}
