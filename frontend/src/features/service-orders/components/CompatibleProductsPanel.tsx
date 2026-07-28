import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";

import { formatCurrency } from "../../../utils/format";
import type {
  CompatibleProduct,
  CompatibleProductsResponse,
} from "../despieceTypes";
import { ComponentBreadcrumb } from "./ComponentBreadcrumb";

function stockBadge(available: number) {
  if (available <= 0)
    return <Badge color="red" variant="light">Sin existencia</Badge>;
  return <Badge color="green" variant="light">Disponible</Badge>;
}

function ProductRow({
  product,
  disabled,
  onAdd,
}: {
  product: CompatibleProduct;
  disabled: boolean;
  onAdd: (productId: number, quantity: number) => void;
}) {
  const [qty, setQty] = useState<number | string>(1);
  const available = Number(product.available_quantity);
  return (
    <Card withBorder padding="sm" radius="md">
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
            onClick={() => onAdd(product.id, Number(qty) || 1)}
          >
            Agregar a la orden
          </Button>
        </Stack>
      </Group>
    </Card>
  );
}

export function CompatibleProductsPanel({
  data,
  isLoading,
  disabled,
  onAdd,
}: {
  data: CompatibleProductsResponse | undefined;
  isLoading: boolean;
  disabled: boolean;
  onAdd: (productId: number, quantity: number) => void;
}) {
  if (isLoading) return <Text c="dimmed" size="sm">Cargando piezas…</Text>;
  if (!data)
    return (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        Selecciona un componente en el árbol o el diagrama para ver sus piezas.
      </Text>
    );
  return (
    <Stack gap="sm">
      <ComponentBreadcrumb path={data.component.path} />
      {data.products.length === 0 ? (
        <Text c="dimmed" size="sm">
          No hay piezas compatibles registradas para este componente.
        </Text>
      ) : (
        data.products.map((p) => (
          <ProductRow key={p.id} product={p} disabled={disabled} onAdd={onAdd} />
        ))
      )}
    </Stack>
  );
}
