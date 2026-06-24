import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAdjustments } from "@tabler/icons-react";
import { useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import { AdjustStockModal } from "./AdjustStockModal";
import { useProduct, useProductMovements } from "./api";
import { MOVEMENT_COLOR, MOVEMENT_LABEL, type InventoryMovement } from "./types";

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
      <DetailHeader
        backTo="/inventory"
        backLabel="Inventario"
        title={product.name}
        badge={
          <Badge color={product.is_active ? "green" : "gray"} variant="light">
            {product.is_active ? "Activo" : "Inactivo"}
          </Badge>
        }
        actions={
          <Button leftSection={<IconAdjustments size={18} />} onClick={open}>
            Ajustar stock
          </Button>
        }
      />

      <Card>
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
          minWidth={760}
          emptyText="Sin movimientos."
        />
      </div>

      <AdjustStockModal opened={adjustOpen} onClose={close} product={product} />
    </Stack>
  );
}
