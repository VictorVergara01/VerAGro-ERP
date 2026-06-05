import { Alert, Badge, Card, Grid, Loader, Stack, Text } from "@mantine/core";
import { useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  useEquipment,
  useEquipmentServiceHistory,
  type EquipmentServiceSummary,
} from "./api";
import { STATUS_COLOR, STATUS_LABEL } from "./types";

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
      <DetailHeader
        backTo="/equipment"
        backLabel="Equipos"
        title={equipment.name}
        badge={
          <Badge color={STATUS_COLOR[equipment.status ?? "active"]} variant="light">
            {STATUS_LABEL[equipment.status ?? "active"]}
          </Badge>
        }
      />

      <Card>
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
