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
import { useDisclosure } from "@mantine/hooks";
import { IconAdjustments, IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { formatCurrency, formatDate } from "../../utils/format";
import { AdjustStockModal } from "./AdjustStockModal";
import { useProduct, useProductMovements } from "./api";
import { MOVEMENT_COLOR, MOVEMENT_LABEL, type InventoryMovement } from "./types";

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text component="div">{value !== undefined && value !== null && value !== "" ? value : "—"}</Text>
    </div>
  );
}

const movementColumns: Column<InventoryMovement>[] = [
  { header: "Fecha", render: (m) => formatDate(m.created_at) },
  {
    header: "Tipo",
    render: (m) => (
      <Badge color={MOVEMENT_COLOR[m.movement_type ?? ""] ?? "gray"} variant="light">
        {MOVEMENT_LABEL[m.movement_type ?? ""] ?? m.movement_type}
      </Badge>
    ),
  },
  { header: "Cantidad", align: "right", render: (m) => m.quantity },
  { header: "Costo unit.", align: "right", render: (m) => formatCurrency(m.unit_cost) },
  { header: "Referencia", render: (m) => m.reference_type || "—" },
  { header: "Notas", render: (m) => m.notes || "—" },
];

export function ProductDetailPage() {
  const { id } = useParams();
  const productId = id ? Number(id) : undefined;
  const { data: product, isLoading, error } = useProduct(productId);
  const movements = useProductMovements(productId);
  const [adjustOpen, { open, close }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !product)
    return <Alert color="red">No se pudo cargar el producto.</Alert>;

  return (
    <Stack>
      <Group justify="space-between">
        <Group>
          <Button
            component={Link}
            to="/inventory"
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
          >
            Inventario
          </Button>
          <Text fz={24} fw={700}>
            {product.name}
          </Text>
          <Badge color={product.is_active ? "green" : "gray"} variant="light">
            {product.is_active ? "Activo" : "Inactivo"}
          </Badge>
        </Group>
        <Button leftSection={<IconAdjustments size={18} />} onClick={open}>
          Ajustar stock
        </Button>
      </Group>

      <Card withBorder radius="md">
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="SKU" value={product.sku} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Marca / Modelo" value={`${product.brand || "—"} ${product.model || ""}`} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Ubicación" value={product.location} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Unidad" value={product.unit_of_measure} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Stock" value={product.stock_quantity} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Reservado" value={product.reserved_quantity} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Disponible" value={product.available_quantity} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Stock mínimo" value={product.minimum_stock} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Costo promedio" value={formatCurrency(product.average_cost)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Último costo" value={formatCurrency(product.last_purchase_cost)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Precio de venta" value={formatCurrency(product.sale_price)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Margen %" value={product.default_margin_percentage} />
          </Grid.Col>
        </Grid>
      </Card>

      <div>
        <Text fw={600} mb="xs">
          Movimientos
        </Text>
        <DataTable
          columns={movementColumns}
          rows={movements.data ?? []}
          loading={movements.isLoading}
          rowKey={(m) => m.id as number}
          emptyText="Sin movimientos."
        />
      </div>

      <AdjustStockModal opened={adjustOpen} onClose={close} product={product} />
    </Stack>
  );
}
