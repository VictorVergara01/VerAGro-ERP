import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Menu,
  Stack,
  Tabs,
  Text,
  Stepper,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { ReconcilePartModal } from "./ReconcilePartModal";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { PriceWithFloorWarning } from "../../components/ui/PriceWithFloorWarning";
import { useAuth } from "../auth/useAuth";
import { isAdmin as isAdminRole, canWriteService } from "../auth/roles";
import { ServiceOrderChecklistCard } from "../checklists/ServiceOrderChecklistCard";
import { formatCurrency, formatDate } from "../../utils/format";
import { AddPartModal } from "./AddPartModal";
import { InteractivePartsTab } from "./components/InteractivePartsTab";
import {
  useDeletePart,
  useReserveParts,
  useServiceOrder,
  useServiceOrderAction,
} from "./api";
import { ServiceOrderFormModal } from "./ServiceOrderFormModal";
import {
  PART_STATUS_COLOR,
  PART_STATUS_LABEL,
  PART_SOURCE_LABEL,
  SERVICE_TYPE_LABEL,
  SO_STATUS_COLOR,
  SO_STATUS_LABEL,
  type ServiceOrderPart,
} from "./types";

const TERMINAL = ["finished", "invoiced", "delivered", "cancelled"];

export function ServiceOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const canWrite = canWriteService(user?.role);
  const orderId = id ? Number(id) : undefined;
  const { data: order, isLoading, error } = useServiceOrder(orderId);
  const action = useServiceOrderAction(orderId);
  const reserve = useReserveParts(orderId);
  const del = useDeletePart(orderId);
  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [reconciling, setReconciling] = useState<ServiceOrderPart | null>(null);

  if (isLoading) return <Loader />;
  if (error || !order)
    return <Alert color="red">No se pudo cargar la orden.</Alert>;

  const status = order.status ?? "received";
  const terminal = TERMINAL.includes(status);

  const act = async (a: Parameters<typeof action.mutateAsync>[0], ok: string) => {
    try {
      await action.mutateAsync(a);
      notifications.show({ color: "green", message: ok });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmCancel = () =>
    modals.openConfirmModal({
      title: "Cancelar orden",
      children:
        "Al cancelar, la orden se ELIMINA permanentemente (se liberan las piezas reservadas). ¿Continuar?",
      labels: { confirm: "Cancelar y eliminar", cancel: "Volver" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await action.mutateAsync("cancel");
          notifications.show({ color: "green", message: "Orden cancelada y eliminada." });
          navigate("/service-orders");
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const doReserve = async () => {
    try {
      const res = await reserve.mutateAsync();
      notifications.show({
        color: "green",
        message: `Reservadas: ${res.reserved.length} · Pendientes de compra: ${res.pending.length}`,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmDeletePart = (p: ServiceOrderPart) =>
    modals.openConfirmModal({
      title: "Quitar pieza",
      children: `¿Quitar "${p.product_name}" de la orden?`,
      labels: { confirm: "Quitar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(p.id);
          notifications.show({ color: "green", message: "Pieza quitada." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const partColumns: Column<ServiceOrderPart>[] = [
    { header: "Producto", render: (p) => p.product_name },
    { header: "Origen", render: (p) => PART_SOURCE_LABEL[p.inventory_source ?? "inventory"] },
    { header: "Cant.", align: "right", render: (p) => p.quantity },
    {
      header: "Precio",
      align: "right",
      render: (p) => (
        <PriceWithFloorWarning
          value={p.unit_price}
          floor={p.price_floor}
          belowMin={p.below_min_price}
        />
      ),
    },
    { header: "Total", align: "right", render: (p) => formatCurrency(p.total_price) },
    {
      header: "Estado",
      render: (p) => (
        <Badge color={PART_STATUS_COLOR[p.status ?? "required"]} variant="light">
          {PART_STATUS_LABEL[p.status ?? "required"]}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (p) => <Group gap="xs">
        {canWrite && (p.status === "pending_inventory" || (!terminal && ["required", "pending_purchase"].includes(p.status ?? "required"))) &&
          <Button size="xs" variant="light" onClick={() => setReconciling(p)}>{p.status === "pending_inventory" ? "Conciliar" : "Sin inventario"}</Button>}
        {!terminal && canWrite && (
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDeletePart(p)}>
            <IconTrash size={18} />
          </ActionIcon>
        )}</Group>,
    },
  ];

  return (
    <Stack>
      <DetailHeader
        backTo="/service-orders"
        backLabel="Órdenes"
        title={order.service_order_number}
        badge={
          <Badge color={SO_STATUS_COLOR[status]} variant="light" size="lg">
            {SO_STATUS_LABEL[status]}
          </Badge>
        }
        actions={
          canWrite ? <>
          {!terminal && (
            <Button variant="default" leftSection={<IconEdit size={18} />} onClick={openEdit}>
              Editar
            </Button>
          )}
          {["received", "in_diagnostic", "quoted", "approved", "waiting_parts"].includes(status) && (
            <Button onClick={() => act("start-work", "En proceso.")}>Iniciar trabajo</Button>
          )}
          {status === "in_progress" && (
            <Button color="teal" onClick={() => act("finish", "Finalizada.")}>
              Finalizar
            </Button>
          )}
          {status === "finished" && (
            <>
              <Badge color="teal" variant="light" size="lg">
                Esperando facturación / pago
              </Badge>
              {isAdmin && (
                <Button
                  color="green"
                  variant="outline"
                  onClick={() =>
                    act("deliver", "Entregada (override de admin, sin cobro).")
                  }
                >
                  Entregar sin cobro
                </Button>
              )}
            </>
          )}
          {status === "invoiced" && (
            <Button color="green" onClick={() => act("deliver", "Entregada.")}>
              Entregar
            </Button>
          )}
          {!terminal && (
            <Menu position="bottom-end">
              <Menu.Target>
                <Button variant="light" rightSection={<IconChevronDown size={16} />}>
                  Más
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item color="red" onClick={confirmCancel}>
                  Cancelar orden
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
          </> : undefined
        }
      />

      {status !== "cancelled" && <Stepper size="xs" active={status === "delivered" ? 4 : ["finished", "invoiced"].includes(status) ? 2 : ["received", "in_diagnostic", "quoted", "approved"].includes(status) ? 0 : 1}>
        <Stepper.Step label="Recepción" />
        <Stepper.Step label="Trabajo" />
        <Stepper.Step label="Lista para entregar" />
        <Stepper.Step label="Entrega" />
      </Stepper>}

      <Card>
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Cliente" value={order.customer_name} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Equipo" value={order.equipment_name || "—"} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Tipo" value={SERVICE_TYPE_LABEL[order.service_type ?? "diagnostic"]} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Recibida" value={formatDate(order.received_date)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Técnico" value={order.technician_name || "Sin asignar"} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Field label="Reclamo del cliente" value={order.customer_complaint} />
          </Grid.Col>
          {order.diagnostic_summary && (
            <Grid.Col span={12}>
              <Field label="Diagnóstico" value={order.diagnostic_summary} />
            </Grid.Col>
          )}
          {order.technical_notes && <Grid.Col span={12}>
            <Field label="Trabajo realizado" value={order.technical_notes} />
          </Grid.Col>}
        </Grid>
      </Card>

      {(order.parts ?? []).some((p) => p.status === "pending_inventory") && <Alert color="orange" title="Piezas pendientes de inventario">
        Puedes terminar la reparación. Usa «Conciliar» en cada pieza cuando actualices el inventario.
      </Alert>}
      <Tabs defaultValue="parts">
        <Tabs.List>
          <Tabs.Tab value="despiece">Despiece</Tabs.Tab>
          <Tabs.Tab value="parts">Piezas</Tabs.Tab>
          <Tabs.Tab value="checklist">Checklist</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="despiece" pt="md">
          <InteractivePartsTab order={order} />
        </Tabs.Panel>
        <Tabs.Panel value="parts" pt="md">
          <Card>
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Piezas</Text>
              {!terminal && canWrite && (
                <Group>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={doReserve}
                    loading={reserve.isPending}
                    disabled={!["approved", "waiting_parts", "in_progress"].includes(status)}
                  >
                    Reservar piezas
                  </Button>
                  <Button size="xs" leftSection={<IconPlus size={16} />} onClick={openAdd}>
                    Agregar pieza
                  </Button>
                </Group>
              )}
            </Group>
            <DataTable
              columns={partColumns}
              rows={order.parts ?? []}
              rowKey={(p) => p.id}
              emptyText="Sin piezas."
            />
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="checklist" pt="md">
          {orderId != null && (
            <ServiceOrderChecklistCard orderId={orderId} editable={!terminal} />
          )}
        </Tabs.Panel>
      </Tabs>

      <Group justify="flex-end">
        <Card withBorder radius="md" w={320}>
          <Stack gap={4}>
            <Group justify="space-between">
              <Text c="dimmed">Mano de obra</Text>
              <Text>{formatCurrency(order.labor_cost)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Diagnóstico</Text>
              <Text>{formatCurrency(order.diagnostic_fee)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Descuento ({Number(order.discount_percentage)}%)</Text>
              <Text>−{formatCurrency(order.discount_amount)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Impuesto ({Number(order.tax_percentage)}%)</Text>
              <Text>{formatCurrency(order.tax_amount)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(order.total_amount)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      {orderId != null && (
        <AddPartModal
          opened={addOpen}
          onClose={closeAdd}
          orderId={orderId}
          equipmentType={order.equipment_type ?? null}
          equipmentTypeName={order.equipment_type_name ?? null}
        />
      )}
      <ServiceOrderFormModal opened={editOpen} onClose={closeEdit} order={order} />
      {reconciling && orderId != null && <ReconcilePartModal key={reconciling.id} part={reconciling} orderId={orderId} onClose={() => setReconciling(null)} />}
    </Stack>
  );
}
