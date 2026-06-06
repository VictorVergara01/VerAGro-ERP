import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconPlus,
  IconSend,
  IconTrash,
  IconTruckDelivery,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  useAddAdditionalCost,
  useDeleteAdditionalCost,
  usePurchaseOrder,
  usePurchaseOrderAction,
} from "./api";
import { ReceiveModal } from "./ReceiveModal";
import { PO_STATUS_COLOR, PO_STATUS_LABEL } from "./types";

export function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const orderId = id ? Number(id) : undefined;
  const { data: order, isLoading, error } = usePurchaseOrder(orderId);
  const action = usePurchaseOrderAction(orderId);
  const addCost = useAddAdditionalCost(orderId);
  const deleteCost = useDeleteAdditionalCost(orderId);
  const [receiveOpen, { open, close }] = useDisclosure(false);
  const [costName, setCostName] = useState("");
  const [costAmount, setCostAmount] = useState<number | string>("");

  if (isLoading) return <Loader />;
  if (error || !order)
    return <Alert color="red">No se pudo cargar la orden.</Alert>;

  const status = order.status ?? "draft";
  const canSend = status === "draft";
  const canRecalc = status === "draft" || status === "sent";
  const canReceive = status === "sent" || status === "partially_received";
  const canCancel = status !== "received" && status !== "cancelled";

  const run = async (a: "send" | "recalculate" | "cancel", okMsg: string) => {
    try {
      await action.mutateAsync(a);
      notifications.show({ color: "green", message: okMsg });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmCancel = () =>
    modals.openConfirmModal({
      title: "Cancelar orden",
      children: "¿Cancelar esta orden de compra?",
      labels: { confirm: "Cancelar orden", cancel: "Volver" },
      confirmProps: { color: "red" },
      onConfirm: () => run("cancel", "Orden cancelada."),
    });

  const submitCost = async () => {
    if (!costName.trim()) return;
    try {
      await addCost.mutateAsync({ name: costName.trim(), amount: String(costAmount || 0) });
      notifications.show({ color: "green", message: "Costo agregado." });
      setCostName("");
      setCostAmount("");
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const removeCost = async (costId: number) => {
    try {
      await deleteCost.mutateAsync(costId);
      notifications.show({ color: "green", message: "Costo eliminado." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Stack>
      <DetailHeader
        backTo="/purchasing"
        backLabel="Compras"
        title={order.order_number}
        badge={
          <Badge color={PO_STATUS_COLOR[status]} variant="light">
            {PO_STATUS_LABEL[status]}
          </Badge>
        }
        actions={
          <>
            {canSend && (
              <Button
                leftSection={<IconSend size={18} />}
                onClick={() => run("send", "Orden enviada.")}
                loading={action.isPending}
              >
                Enviar
              </Button>
            )}
            {canReceive && (
              <Button
                color="teal"
                leftSection={<IconTruckDelivery size={18} />}
                onClick={open}
              >
                Recibir
              </Button>
            )}
            {canCancel && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconX size={18} />}
                onClick={confirmCancel}
              >
                Cancelar
              </Button>
            )}
          </>
        }
      />

      <Card>
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Proveedor" value={order.supplier_name} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Fecha" value={formatDate(order.order_date)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Esperada" value={formatDate(order.expected_date)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Moneda" value={order.currency} />
          </Grid.Col>
        </Grid>
      </Card>

      <Card>
        <Text fw={600} mb="sm">
          Líneas y costeo
        </Text>
        <Table.ScrollContainer minWidth={760}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Cant.</Table.Th>
                <Table.Th ta="right">Recib.</Table.Th>
                <Table.Th ta="right">Costo unit.</Table.Th>
                <Table.Th ta="right">Subtotal</Table.Th>
                <Table.Th ta="right">Costo asignado</Table.Th>
                <Table.Th ta="right">Costo real (landed)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(order.lines ?? []).map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.product_name}</Table.Td>
                  <Table.Td ta="right">{l.quantity_ordered}</Table.Td>
                  <Table.Td ta="right">{l.quantity_received}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(l.unit_purchase_cost)}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(l.line_subtotal)}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(l.allocated_extra_cost)}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(l.landed_unit_cost)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Group align="flex-start" grow>
        <Card>
          <Text fw={600} mb="sm">
            Costos adicionales
          </Text>
          {(order.additional_costs ?? []).length === 0 ? (
            <Text c="dimmed" size="sm">
              Sin costos adicionales.
            </Text>
          ) : (
            <Table>
              <Table.Tbody>
                {(order.additional_costs ?? []).map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>{c.name}</Table.Td>
                    <Table.Td ta="right">{formatCurrency(c.amount)}</Table.Td>
                    {canRecalc && (
                      <Table.Td w={40} ta="right">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => removeCost(c.id)}
                          loading={deleteCost.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {canRecalc && (
            <Group mt="sm" align="flex-end" gap="xs">
              <TextInput
                label="Concepto"
                placeholder="Envío, aduana…"
                value={costName}
                onChange={(e) => setCostName(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <NumberInput
                label="Monto"
                min={0}
                decimalScale={2}
                w={120}
                value={costAmount}
                onChange={(v) => setCostAmount(typeof v === "bigint" ? Number(v) : v)}
              />
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={submitCost}
                loading={addCost.isPending}
                disabled={!costName.trim()}
              >
                Agregar
              </Button>
            </Group>
          )}
        </Card>
        <Card>
          <Text fw={600} mb="sm">
            Totales
          </Text>
          <Stack gap={4}>
            <Group justify="space-between">
              <Text c="dimmed">Subtotal productos</Text>
              <Text>{formatCurrency(order.subtotal_products)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Envío</Text>
              <Text>{formatCurrency(order.shipping_cost)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Costos adicionales</Text>
              <Text>{formatCurrency(order.additional_costs_total)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(order.grand_total)}</Text>
            </Group>
          </Stack>
        </Card>
      </Group>

      <ReceiveModal opened={receiveOpen} onClose={close} order={order} />
    </Stack>
  );
}
