import { ActionIcon, Button, Group, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { canWriteFieldJobs } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { useDeleteFieldPlot, useFieldPlots } from "./api";
import { FieldPlotFormModal } from "./FieldPlotFormModal";
import type { FieldPlot } from "./types";

export function FieldPlotsTab({ customerId }: { customerId: number }) {
  const { user } = useAuth();
  const canWrite = canWriteFieldJobs(user?.role);
  const { data, isLoading } = useFieldPlots({ customer: customerId });
  const del = useDeleteFieldPlot();
  const [editing, setEditing] = useState<FieldPlot | null>(null);
  const [formOpen, { open, close }] = useDisclosure(false);

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (p: FieldPlot) => {
    setEditing(p);
    open();
  };

  const confirmDelete = (p: FieldPlot) =>
    modals.openConfirmModal({
      title: "Eliminar lote",
      children: `¿Marcar el lote "${p.name}" como inactivo?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(p.id);
          notifications.show({ color: "green", message: "Lote eliminado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<FieldPlot>[] = [
    { header: "Nombre", render: (p) => p.name },
    { header: "Hectáreas", align: "right", render: (p) => Number(p.hectares ?? 0).toLocaleString("es-PA") },
    { header: "Cultivo", render: (p) => (p.crop === "other" ? p.crop_other || "Otros" : p.crop_display || "—") },
    { header: "Ubicación", render: (p) => p.location || "—" },
    { header: "Tasa (L/ha)", align: "right", render: (p) => p.water_per_hectare ?? "—" },
    { header: "Químicos", align: "right", render: (p) => (p.products ?? []).length },
    ...(canWrite
      ? [
          {
            header: "",
            align: "right" as const,
            render: (p: FieldPlot) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon variant="subtle" aria-label="Editar lote" onClick={() => openEdit(p)}>
                  <IconEdit size={18} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label="Eliminar lote" onClick={() => confirmDelete(p)}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            ),
          },
        ]
      : []),
  ];

  return (
    <Stack>
      {canWrite && (
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Nuevo lote
          </Button>
        </Group>
      )}
      <DataTable
        columns={columns}
        rows={data ?? []}
        loading={isLoading}
        rowKey={(p) => p.id}
        emptyText="Este cliente no tiene lotes."
      />
      <FieldPlotFormModal
        opened={formOpen}
        onClose={close}
        customerId={customerId}
        plot={editing}
      />
    </Stack>
  );
}
