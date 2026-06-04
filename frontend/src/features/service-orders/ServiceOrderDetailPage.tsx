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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconChevronDown,
  IconEdit,
  IconFileInvoice,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { ServiceOrderChecklistCard } from "../checklists/ServiceOrderChecklistCard";
import { formatCurrency, formatDate } from "../../utils/format";
import { AddPartModal } from "./AddPartModal";
import {
  useDeletePart,
  useGenerateDocument,
  useReserveParts,
  useServiceOrder,
  useServiceOrderAction,
} from "./api";
import { ServiceOrderFormModal } from "./ServiceOrderFormModal";
import {
  PART_STATUS_COLOR,
  PART_STATUS_LABEL,
  SERVICE_TYPE_LABEL,
  SO_STATUS_COLOR,
  SO_STATUS_LABEL,
  type ServiceOrderPart,
} from "./types";

const TERMINAL = ["finished", "invoiced", "delivered", "cancelled"];

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text component="div">{value ?? "—"}</Text>
    </div>
  );
}

export function ServiceOrderDetailPage() {
  const { id } = useParams();
  const orderId = id ? Number(id) : undefined;
  const { data: order, isLoading, error } = useServiceOrder(orderId);
  const action = useServiceOrderAction(orderId);
  const reserve = useReserveParts(orderId);
  const generate = useGenerateDocument(orderId);
  const del = useDeletePart(orderId);
  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

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

  const doGenerate = async (kind: "quote" | "invoice") => {
    try {
      const doc = await generate.mutateAsync(kind);
      notifications.show({
        color: "green",
        message:
          kind === "quote"
            ? `Cotización ${doc.quote_number} generada.`
            : `Factura ${doc.invoice_number} generada.`,
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
    { header: "Cant.", align: "right", render: (p) => p.quantity },
    { header: "Precio", align: "right", render: (p) => formatCurrency(p.unit_price) },
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
      render: (p) =>
        terminal ? null : (
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDeletePart(p)}>
            <IconTrash size={18} />
          </ActionIcon>
        ),
    },
  ];

  return (
    <Stack>
      <Group justify="space-between">
        <Group>
          <Button
            component={Link}
            to="/service-orders"
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
          >
            Órdenes
          </Button>
          <Text fz={24} fw={700}>
            {order.service_order_number}
          </Text>
          <Badge color={SO_STATUS_COLOR[status]} variant="light" size="lg">
            {SO_STATUS_LABEL[status]}
          </Badge>
        </Group>
        <Group>
          {!terminal && (
            <Button variant="default" leftSection={<IconEdit size={18} />} onClick={openEdit}>
              Editar
            </Button>
          )}
          {status === "received" && (
            <Button onClick={() => act("start-diagnostic", "En diagnóstico.")}>
              Iniciar diagnóstico
            </Button>
          )}
          {(status === "in_diagnostic" || status === "quoted") && (
            <Button onClick={() => act("approve", "Aprobada.")}>Aprobar</Button>
          )}
          {(status === "approved" || status === "waiting_parts") && (
            <Button onClick={() => act("start-work", "En proceso.")}>Iniciar trabajo</Button>
          )}
          {status === "in_progress" && (
            <Button color="teal" onClick={() => act("finish", "Finalizada.")}>
              Finalizar
            </Button>
          )}
          {(status === "finished" || status === "invoiced") && (
            <Button color="green" onClick={() => act("deliver", "Entregada.")}>
              Entregar
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="light" rightSection={<IconChevronDown size={16} />}>
                Más
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconFileInvoice size={16} />}
                onClick={() => doGenerate("quote")}
              >
                Generar cotización
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileInvoice size={16} />}
                disabled={status !== "finished"}
                onClick={() => doGenerate("invoice")}
              >
                Generar factura
              </Menu.Item>
              {!terminal && (
                <Menu.Item color="red" onClick={() => act("cancel", "Orden cancelada.")}>
                  Cancelar orden
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Card withBorder radius="md">
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
        </Grid>
      </Card>

      <Tabs defaultValue="parts">
        <Tabs.List>
          <Tabs.Tab value="parts">Piezas</Tabs.Tab>
          <Tabs.Tab value="checklist">Checklist</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="parts" pt="md">
          <Card withBorder radius="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Piezas</Text>
              {!terminal && (
                <Group>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={doReserve}
                    loading={reserve.isPending}
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
              <Text c="dimmed">Descuento</Text>
              <Text>−{formatCurrency(order.discount_amount)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Impuesto</Text>
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
        <AddPartModal opened={addOpen} onClose={closeAdd} orderId={orderId} />
      )}
      <ServiceOrderFormModal opened={editOpen} onClose={closeEdit} order={order} />
    </Stack>
  );
}
