import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import { useAdjustStock } from "./api";
import type { Product } from "./types";

export function AdjustStockModal({
  opened,
  onClose,
  product,
}: {
  opened: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const adjust = useAdjustStock();
  const [type, setType] = useState("adjustment_in");
  const [quantity, setQuantity] = useState<number | string>("");
  const [unitCost, setUnitCost] = useState<number | string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (opened) {
      setType("adjustment_in");
      setQuantity("");
      setUnitCost("");
      setNotes("");
    }
  }, [opened]);

  const submit = async () => {
    if (!product) return;
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      notifications.show({ color: "red", message: "Cantidad inválida." });
      return;
    }
    try {
      await adjust.mutateAsync({
        product: product.id,
        movement_type: type as "adjustment_in" | "adjustment_out",
        quantity: String(qty),
        unit_cost: unitCost ? String(unitCost) : undefined,
        notes,
      });
      notifications.show({ color: "green", message: "Ajuste aplicado." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Ajustar stock" size="md">
      {product && (
        <Stack>
          <Text size="sm">
            <b>{product.name}</b> — stock actual: {product.stock_quantity}
          </Text>
          <SegmentedControl
            value={type}
            onChange={(v) => setType(v)}
            data={[
              { value: "adjustment_in", label: "Entrada (+)" },
              { value: "adjustment_out", label: "Salida (−)" },
            ]}
          />
          <NumberInput
            label="Cantidad"
            min={0}
            value={quantity}
            onChange={(v) => setQuantity(v as number | string)}
            decimalScale={2}
          />
          <NumberInput
            label="Costo unitario (opcional)"
            min={0}
            value={unitCost}
            onChange={(v) => setUnitCost(v as number | string)}
            decimalScale={2}
          />
          <Textarea
            label="Notas"
            autosize
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={adjust.isPending}>
              Aplicar
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
