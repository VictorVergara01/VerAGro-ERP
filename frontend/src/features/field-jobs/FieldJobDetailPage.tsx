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
import { CompleteFieldJobModal } from "./CompleteFieldJobModal";
import { useAuth } from "../auth/useAuth";
import { canWriteFieldJobs, canWriteBilling, FINANCIAL_ROLES } from "../auth/roles";
import { FieldAccountPanel } from "../field-collections/FieldAccountPanel";
import { FJ_STATUS_COLOR, FJ_STATUS_LABEL, JOB_TYPE_LABEL } from "./types";

export function FieldJobDetailPage() {
  const { user } = useAuth();
  const canWork = canWriteFieldJobs(user?.role);
  const { id } = useParams();
  const jobId = id ? Number(id) : undefined;
  const { data: job, isLoading, error } = useFieldJob(jobId);
  const action = useFieldJobAction(jobId);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [completeOpen, { open: openComplete, close: closeComplete }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !job) return <Alert color="red">No se pudo cargar el trabajo.</Alert>;

  const status = job.status ?? "scheduled";
  const cropLabel = job.crop === "other" ? (job.crop_other || "Otros") : (job.crop_display || "—");

  const act = async (a: "cancel" | "generate-invoice", ok: string) => {
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
            {status === "scheduled" && canWork && (
              <>
                <Button variant="default" leftSection={<IconEdit size={18} />} onClick={openEdit}>Editar</Button>
                <Button color="teal" onClick={openComplete}>Marcar hecho</Button>
                <Button variant="light" color="red" onClick={confirmCancel}>Cancelar</Button>
              </>
            )}
            {(status === "done" || (status === "invoiced" && !job.invoice_number)) && (
              <>
                {canWriteBilling(user?.role) && <Button color="green" onClick={() => act("generate-invoice", "Factura generada.")}>Facturar</Button>}
                {canWork && <Button variant="light" color="red" onClick={confirmCancel}>Cancelar</Button>}
              </>
            )}
          </>
        }
      />

      <Card>
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Tipo de aplicación" value={JOB_TYPE_LABEL[job.job_type ?? "fumigation"]} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cliente" value={job.customer_name} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Dron" value={job.equipment_name || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Piloto" value={job.pilot_name || "Sin asignar"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Cultivo" value={cropLabel} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Finca" value={job.location || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Lote" value={job.plot_name || "—"} /></Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Programado" value={formatDate(job.scheduled_date)} /></Grid.Col>
          {job.done_date && (
            <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Hecho" value={formatDate(job.done_date)} /></Grid.Col>
          )}
        </Grid>
      </Card>

      {job.actuals_from_legacy && <Alert color="yellow">Registro anterior: se conservaron las cantidades originales. No fueron capturadas mediante el nuevo cierre de trabajo.</Alert>}
      {["done", "invoiced"].includes(status) && FINANCIAL_ROLES.includes(user?.role || "") && <FieldAccountPanel jobId={job.id} />}
      <Card>
        <Text fw={600} mb="sm">Programado y realizado</Text>
        <Grid>
          <Grid.Col span={6}><Field label="Hectáreas programadas" value={job.hectares} /></Grid.Col>
          <Grid.Col span={6}><Field label="Hectáreas trabajadas" value={job.actual_hectares ?? "Pendiente de registrar"} /></Grid.Col>
          {job.job_type === "spreading" && <>
            <Grid.Col span={6}><Field label="Quintales previstos" value={job.estimated_quintals ?? "Sin registrar"} /></Grid.Col>
            <Grid.Col span={6}><Field label="Quintales aplicados" value={job.applied_quintals ?? "Pendiente de registrar"} /></Grid.Col>
          </>}
          <Grid.Col span={6}><Field label="Presupuesto estimado" value={formatCurrency(job.estimated_total ?? job.total)} /></Grid.Col>
          <Grid.Col span={6}><Field label="Total por trabajo realizado" value={status === "scheduled" || status === "cancelled" ? "Pendiente de cierre" : formatCurrency(job.total)} /></Grid.Col>
        </Grid>
      </Card>

      <Group justify="flex-end">
        <Card withBorder radius="md" w={320}>
          <Stack gap={4}>
            <Group justify="space-between">
              <Text c="dimmed">{status === "scheduled" ? "Hectáreas previstas" : "Hectáreas trabajadas"}</Text>
              <Text>{status === "scheduled" ? job.hectares : job.actual_hectares ?? "Sin registrar"}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">{job.billing_unit === "qq" ? "Precio/qq" : "Precio/ha"}</Text>
              <Text>{formatCurrency(job.unit_price)}</Text>
            </Group>
            {job.job_type === "spreading" && <>
              <Group justify="space-between"><Text c="dimmed">Dosis real</Text><Text>{job.actual_quintals_per_hectare != null ? `${job.actual_quintals_per_hectare} qq/ha` : "Sin registrar"}</Text></Group>
              <Group justify="space-between"><Text c="dimmed">Quintales aplicados</Text><Text>{job.applied_quintals != null ? `${job.applied_quintals} qq` : "Sin registrar"}</Text></Group>
              <Group justify="space-between"><Text c="dimmed">Modalidad de cobro</Text><Text>{job.billing_unit === "qq" ? "Por quintal" : "Por hectárea"}</Text></Group>
            </>}
            <Group justify="space-between">
              <Text fw={700}>{status === "scheduled" ? "Total estimado" : "Total"}</Text>
              <Text fw={700}>{formatCurrency(job.total)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      {job.products && job.products.length > 0 && (
        <Card>
          <Text fw={600} mb="xs">Productos y dosis previstos</Text>
          {job.products.map((p) => (
            <Group key={p.id} justify="space-between">
              <Text>{p.name}</Text>
              <Text c="dimmed">{p.dose_per_hectare} {p.unit} · Previsto: {Number((Number(p.dose_per_hectare) * Number(job.hectares)).toFixed(4))} {p.unit.replace("/ha", "")}</Text>
            </Group>
          ))}
        </Card>
      )}

      {job.job_type !== "spreading" && (job.water_per_hectare != null || job.tank_volume_liters != null) && (
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
      {completeOpen && <CompleteFieldJobModal job={job} onClose={closeComplete} />}
    </Stack>
  );
}
