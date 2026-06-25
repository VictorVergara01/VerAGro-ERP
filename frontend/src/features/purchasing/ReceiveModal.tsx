import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import { useReceivePurchaseOrder } from "./api";
import type { PurchaseOrder } from "./types";

export function ReceiveModal({
  opened,
  onClose,
  order,
}: {
  opened: boolean;
  onClose: () => void;
  order: PurchaseOrder;
}) {
  const receive = useReceivePurchaseOrder(order.id);
  const [qty, setQty] = useState<Record<number, number | string>>({});

  const lines = order.lines ?? [];

  useEffect(() => {
    if (opened) {
      const init: Record<number, number | string> = {};
      for (const l of lines) {
        const pending = Number(l.quantity_ordered) - Number(l.quantity_received);
        init[l.id] = pending > 0 ? pending : 0;
      }
      setQty(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const submitAll = async () => {
    try {
      await receive.mutateAsync({ receive_all: true });
      notifications.show({ color: "green", message: "Recepción registrada." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const submitPartial = async () => {
    const receipts = lines
      .map((l) => ({ line: l.id, quantity: String(qty[l.id] ?? 0) }))
      .filter((r) => Number(r.quantity) > 0);
    if (receipts.length === 0) {
      notifications.show({ color: "red", message: "Indica cantidades a recibir." });
      return;
    }
    try {
      await receive.mutateAsync({ receipts });
      notifications.show({ color: "green", message: "Recepción registrada." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Recibir orden" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Ajusta las cantidades a recibir o usa “Recibir todo”.
        </Text>
        <Table.ScrollContainer minWidth={460}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th w={80} style={{ textAlign: "right" }}>
                Pedido
              </Table.Th>
              <Table.Th w={80} style={{ textAlign: "right" }}>
                Recibido
              </Table.Th>
              <Table.Th w={120}>A recibir</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l) => {
              const pending = Number(l.quantity_ordered) - Number(l.quantity_received);
              return (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.product_name}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>{l.quantity_ordered}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>{l.quantity_received}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      min={0}
                      max={pending}
                      decimalScale={2}
                      value={qty[l.id] ?? 0}
                      onChange={(v) => setQty((s) => ({ ...s, [l.id]: v as number }))}
                      disabled={pending <= 0}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
        <Group justify="space-between">
          <Button
            variant="light"
            onClick={submitAll}
            loading={receive.isPending}
          >
            Recibir todo
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submitPartial} loading={receive.isPending}>
              Recibir indicado
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
