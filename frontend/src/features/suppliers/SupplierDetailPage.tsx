import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconEdit, IconPlus, IconStar, IconTrash } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  useDeleteSupplierProduct,
  useSupplier,
  useSupplierProducts,
  useSupplierPurchaseHistory,
} from "./api";
import { SupplierProductModal } from "./SupplierProductModal";
import type { PurchaseHistoryItem, SupplierProduct } from "./types";

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text component="div">{value ? value : "—"}</Text>
    </div>
  );
}

const purchaseColumns: Column<PurchaseHistoryItem>[] = [
  { header: "N.º", render: (o) => o.order_number },
  { header: "Estado", render: (o) => <Badge variant="light">{o.status}</Badge> },
  { header: "Fecha", render: (o) => formatDate(o.order_date) },
  { header: "Total", align: "right", render: (o) => formatCurrency(o.grand_total) },
];

export function SupplierDetailPage() {
  const { id } = useParams();
  const supplierId = id ? Number(id) : undefined;
  const { data: supplier, isLoading, error } = useSupplier(supplierId);
  const supplierProducts = useSupplierProducts(supplierId);
  const purchases = useSupplierPurchaseHistory(supplierId);
  const del = useDeleteSupplierProduct(supplierId);
  const [editing, setEditing] = useState<SupplierProduct | null>(null);
  const [modalOpen, { open, close }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !supplier)
    return <Alert color="red">No se pudo cargar el proveedor.</Alert>;

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (sp: SupplierProduct) => {
    setEditing(sp);
    open();
  };
  const confirmDelete = (sp: SupplierProduct) =>
    modals.openConfirmModal({
      title: "Quitar producto",
      children: `¿Quitar "${sp.product_sku}" de este proveedor?`,
      labels: { confirm: "Quitar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(sp.id);
          notifications.show({ color: "green", message: "Producto quitado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const productColumns: Column<SupplierProduct>[] = [
    { header: "SKU", render: (sp) => sp.product_sku },
    { header: "SKU prov.", render: (sp) => sp.supplier_sku || "—" },
    { header: "Último costo", align: "right", render: (sp) => formatCurrency(sp.last_cost) },
    { header: "Moneda", render: (sp) => sp.currency },
    {
      header: "Preferido",
      render: (sp) =>
        sp.is_preferred ? (
          <Badge color="yellow" variant="light" leftSection={<IconStar size={12} />}>
            Sí
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      header: "",
      align: "right",
      render: (sp) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => openEdit(sp)}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(sp)}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  return (
    <Stack>
      <Group>
        <Button
          component={Link}
          to="/suppliers"
          variant="subtle"
          leftSection={<IconArrowLeft size={18} />}
        >
          Proveedores
        </Button>
        <Text fz={24} fw={700}>
          {supplier.name}
        </Text>
        <Badge color={supplier.is_active ? "green" : "gray"} variant="light">
          {supplier.is_active ? "Activo" : "Inactivo"}
        </Badge>
      </Group>

      <Card withBorder radius="md">
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Razón social" value={supplier.legal_name} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="País" value={supplier.country} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Contacto" value={supplier.contact_person} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Teléfono" value={supplier.phone} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Correo" value={supplier.email} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Días de entrega" value={supplier.estimated_delivery_days} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Términos de pago" value={supplier.payment_terms} />
          </Grid.Col>
        </Grid>
      </Card>

      <Tabs defaultValue="products">
        <Tabs.List>
          <Tabs.Tab value="products">Productos</Tabs.Tab>
          <Tabs.Tab value="purchases">Compras</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="products" pt="md">
          <Group justify="flex-end" mb="sm">
            <Button
              size="xs"
              leftSection={<IconPlus size={16} />}
              onClick={openNew}
            >
              Asociar producto
            </Button>
          </Group>
          <DataTable
            columns={productColumns}
            rows={supplierProducts.data ?? []}
            loading={supplierProducts.isLoading}
            rowKey={(sp) => sp.id}
            emptyText="Sin productos asociados."
          />
        </Tabs.Panel>
        <Tabs.Panel value="purchases" pt="md">
          <DataTable
            columns={purchaseColumns}
            rows={purchases.data ?? []}
            loading={purchases.isLoading}
            rowKey={(o) => o.id}
            emptyText="Sin órdenes de compra."
          />
        </Tabs.Panel>
      </Tabs>

      {supplierId != null && (
        <SupplierProductModal
          opened={modalOpen}
          onClose={close}
          supplierId={supplierId}
          item={editing}
        />
      )}
    </Stack>
  );
}
