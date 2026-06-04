import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  useEquipment,
  useEquipmentServiceHistory,
  type EquipmentServiceSummary,
} from "./api";
import { STATUS_COLOR, STATUS_LABEL } from "./types";

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text component="div">{value ? value : "—"}</Text>
    </div>
  );
}

const historyColumns: Column<EquipmentServiceSummary>[] = [
  { header: "N.º", render: (o) => o.service_order_number },
  { header: "Tipo", render: (o) => o.service_type },
  { header: "Estado", render: (o) => <Badge variant="light">{o.status}</Badge> },
  { header: "Recibida", render: (o) => formatDate(o.received_date) },
  { header: "Finalizada", render: (o) => formatDate(o.finished_date) },
  { header: "Total", align: "right", render: (o) => formatCurrency(o.total_amount) },
];

export function EquipmentDetailPage() {
  const { id } = useParams();
  const equipmentId = id ? Number(id) : undefined;
  const { data: equipment, isLoading, error } = useEquipment(equipmentId);
  const history = useEquipmentServiceHistory(equipmentId);

  if (isLoading) return <Loader />;
  if (error || !equipment)
    return <Alert color="red">No se pudo cargar el equipo.</Alert>;

  return (
    <Stack>
      <Group>
        <Button
          component={Link}
          to="/equipment"
          variant="subtle"
          leftSection={<IconArrowLeft size={18} />}
        >
          Equipos
        </Button>
        <Text fz={24} fw={700}>
          {equipment.name}
        </Text>
        <Badge color={STATUS_COLOR[equipment.status ?? "active"]} variant="light">
          {STATUS_LABEL[equipment.status ?? "active"]}
        </Badge>
      </Group>

      <Card withBorder radius="md">
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Tipo" value={equipment.equipment_type_name} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Cliente" value={equipment.customer_name ?? "Empresa"} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Marca" value={equipment.brand} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Modelo" value={equipment.model} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="N.º de serie" value={equipment.serial_number} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Código interno" value={equipment.internal_code} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Compra" value={formatDate(equipment.purchase_date)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field
              label="Vence garantía"
              value={formatDate(equipment.warranty_expiration)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Field label="Notas" value={equipment.notes} />
          </Grid.Col>
        </Grid>
      </Card>

      <div>
        <Text fw={600} mb="xs">
          Historial de servicio
        </Text>
        <DataTable
          columns={historyColumns}
          rows={history.data ?? []}
          loading={history.isLoading}
          rowKey={(o) => o.id}
          emptyText="Sin órdenes de servicio."
        />
      </div>
    </Stack>
  );
}
