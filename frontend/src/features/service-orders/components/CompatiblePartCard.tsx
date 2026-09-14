import { Badge, Button, Card, Group, NumberInput, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";

import { formatCurrency } from "../../../utils/format";
import type { CompatibleProduct } from "../despieceTypes";

function stockBadge(available: number) {
  if (available <= 0)
    return <Badge color="red" variant="light">Sin existencia</Badge>;
  return <Badge color="green" variant="light">Disponible</Badge>;
}

export function CompatiblePartCard({
  product,
  disabled,
  onAdd,
}: {
  product: CompatibleProduct;
  disabled: boolean;
  onAdd: (product: CompatibleProduct, quantity: number) => void;
}) {
  const [qty, setQty] = useState<number | string>(1);
  const available = Number(product.available_quantity);
  return (
    <Card withBorder padding="sm" radius="md" data-part-card>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text ff="monospace" size="sm" fw={600}>
              {product.sku}
            </Text>
            {product.is_primary && (
              <Badge size="xs" color="teal" variant="light">Principal</Badge>
            )}
            {stockBadge(available)}
          </Group>
          <Text size="sm">{product.name}</Text>
          <Text size="xs" c="dimmed">
            Disp. {product.available_quantity} · Reserv. {product.reserved_quantity} ·{" "}
            {formatCurrency(product.sale_price)} · Ubic. {product.location || "—"}
          </Text>
          {product.part_number && (
            <Text size="xs" c="dimmed" ff="monospace">
              N.º pieza: {product.part_number}
            </Text>
          )}
        </div>
        <Stack gap={6} align="flex-end">
          <NumberInput<number>
            value={qty}
            onChange={setQty}
            min={1}
            step={1}
            w={80}
            size="xs"
            aria-label={`Cantidad ${product.sku}`}
          />
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            disabled={disabled}
            onClick={() => onAdd(product, Number(qty) || 1)}
          >
            Agregar a la orden
          </Button>
        </Stack>
      </Group>
    </Card>
  );
}
