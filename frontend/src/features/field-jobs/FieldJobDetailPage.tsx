import { Alert, Badge, Button, Card, Grid, Group, Loader, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit } from "@tabler/icons-react";
import { useParams } from "react-router-dom";

import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import { useFieldJob, useFieldJobAction } from "./api";
import { FieldJobFormModal } from "./FieldJobFormModal";
import { FJ_STATUS_COLOR, FJ_STATUS_LABEL } from "./types";

export function FieldJobDetailPage() {
  const { id } = useParams();
  const jobId = id ? Number(id) : undefined;
  const { data: job, isLoading, error } = useFieldJob(jobId);
  const action = useFieldJobAction(jobId);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !job) return <Alert color="red">No se pudo cargar el trabajo.</Alert>;

  const status = job.status ?? "scheduled";
  const cropLabel = job.crop === "other" ? (job.crop_other || "Otros") : (job.crop_display || "—");

  const act = async (a: "mark-done" | "cancel" | "generate-invoice", ok: string) => {
    try {
      const res = await action.mutateAsync(a);
      notifications.show({
        color: "green",
        message: a === "generate-invoice" ? `Factura ${res.invoice_number} generada.` : ok,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmCancel = () =>
    modals.openConfirmModal({
      title: "Cancelar trabajo",
      children: "¿Cancelar este trabajo de campo?",
      labels: { confirm: "Cancelar trabajo", cancel: "Volver" },
      confirmProps: { color: "red" },
      onConfirm: () => act("cancel", "Trabajo cancelado."),
    });

  return (
    <Stack>
      <DetailHeader
        backTo="/field-jobs"
        backLabel="Trabajos de campo"
        title={job.number}
        badge={
          <Badge color={FJ_STATUS_COLOR[status]} variant="light" size="lg">
            {FJ_STATUS_LABEL[status]}
          </Badge>
        }
        actions={
          <>
            {status === "scheduled" && (
              <>
                <Button variant="default" leftSection={<IconEdit size={18} />} onClick={openEdit}>Editar</Button>
                <Button color="teal" onClick={() => act("mark-done", "Marcado como hecho.")}>Marcar hecho</Button>
                <Button variant="light" color="red" onClick={confirmCancel}>Cancelar</Button>
              </>
            )}
            {status === "done" && (
              <>
                <Button color="green" onClick={() => act("generate-invoice", "Factura generada.")}>Facturar</Button>
                <Button variant="light" color="red" onClick={confirmCancel}>Cancelar</Button>
              </>
            )}
          </>
        }
      />

      <Card>
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cliente" value={job.customer_name} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Dron" value={job.equipment_name || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Piloto" value={job.technician_name || "Sin asignar"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cultivo" value={cropLabel} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Finca" value={job.location || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Programado" value={formatDate(job.scheduled_date)} /></Grid.Col>
          {job.done_date && (
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Hecho" value={formatDate(job.done_date)} /></Grid.Col>
          )}
        </Grid>
      </Card>

      <Group justify="flex-end">
        <Card withBorder radius="md" w={320}>
          <Stack gap={4}>
            <Group justify="space-between">
              <Text c="dimmed">Hectáreas</Text>
              <Text>{job.hectares}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Precio/ha</Text>
              <Text>{formatCurrency(job.unit_price)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(job.total)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      {job.products && job.products.length > 0 && (
        <Card>
          <Text fw={600} mb="xs">Químicos aplicados</Text>
          {job.products.map((p) => (
            <Group key={p.id} justify="space-between">
              <Text>{p.name}</Text>
              <Text c="dimmed">{p.dose_per_hectare} {p.unit}</Text>
            </Group>
          ))}
        </Card>
      )}

      {(job.water_per_hectare != null || job.tank_volume_liters != null) && (
        <Card><Text fw={600} mb="xs">Aplicación</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 4 }}><Field label="Tasa de aplicación (L/ha)" value={job.water_per_hectare ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}><Field label="Tanque (L)" value={job.tank_volume_liters ?? "—"} /></Grid.Col>
          </Grid>
        </Card>
      )}

      {job.notes && (
        <Card><Field label="Notas" value={job.notes} /></Card>
      )}

      <FieldJobFormModal opened={editOpen} onClose={closeEdit} job={job} />
    </Stack>
  );
}
