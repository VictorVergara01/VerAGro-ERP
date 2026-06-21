import { Alert, Anchor, Badge, Button, Card, Grid, Group, Loader, Stack, Text } from "@mantine/core";
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
import { FJ_STATUS_COLOR, FJ_STATUS_LABEL, JOB_TYPE_LABEL } from "./types";

export function FieldJobDetailPage() {
  const { id } = useParams();
  const jobId = id ? Number(id) : undefined;
  const { data: job, isLoading, error } = useFieldJob(jobId);
  const action = useFieldJobAction(jobId);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !job) return <Alert color="red">No se pudo cargar el trabajo.</Alert>;

  const status = job.status ?? "scheduled";
  const isFumigation = job.job_type === "fumigation";

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

  const hasGps = job.latitude != null && job.longitude != null;

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
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tipo" value={JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Finca" value={job.location || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cultivo" value={job.crop || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Producto" value={job.applied_product || "—"} /></Grid.Col>
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
              <Text c="dimmed">{isFumigation ? "Hectáreas" : "Quintales"}</Text>
              <Text>{isFumigation ? job.hectares : job.quintals}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Precio/{isFumigation ? "ha" : "qq"}</Text>
              <Text>{formatCurrency(job.unit_price)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(job.total)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      {(job.application_rate != null || job.tank_volume_liters != null) && (
        <Card><Text fw={600} mb="xs">Aplicación</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tasa" value={`${job.application_rate ?? "—"} ${job.application_rate_unit_display ?? ""}`} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tanque (L)" value={job.tank_volume_liters ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Agua/ha (L)" value={job.water_per_hectare ?? "—"} /></Grid.Col>
          </Grid>
        </Card>
      )}

      {(job.wind_speed_kmh != null || job.weather_notes) && (
        <Card><Text fw={600} mb="xs">Clima</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Viento (km/h)" value={job.wind_speed_kmh ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Temp (°C)" value={job.temperature_celsius ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Humedad (%)" value={job.humidity_percentage ?? "—"} /></Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Condiciones" value={job.weather_notes || "—"} /></Grid.Col>
          </Grid>
        </Card>
      )}

      {hasGps && (
        <Card><Text fw={600} mb="xs">Coordenadas</Text>
          <Anchor href={`https://www.google.com/maps?q=${job.latitude},${job.longitude}`} target="_blank" rel="noopener noreferrer">
            {job.latitude}, {job.longitude} — abrir en Google Maps
          </Anchor>
        </Card>
      )}

      {job.notes && (
        <Card><Field label="Notas" value={job.notes} /></Card>
      )}

      <FieldJobFormModal opened={editOpen} onClose={closeEdit} job={job} />
    </Stack>
  );
}
