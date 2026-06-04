import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Pagination,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconEdit,
  IconEye,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { formatCurrency } from "../../utils/format";
import { AdjustStockModal } from "./AdjustStockModal";
import {
  useCategories,
  useDeleteProduct,
  useLowStock,
  useProducts,
} from "./api";
import { ProductFormModal } from "./ProductFormModal";
import type { Product } from "./types";

export function InventoryPage() {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [category, setCategory] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [formOpen, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [adjustOpen, { open: openAdjust, close: closeAdjust }] = useDisclosure(false);
  const navigate = useNavigate();

  const categories = useCategories();
  const catName = useMemo(() => {
    const m = new Map<number, string>();
    (categories.data ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories.data]);

  const list = useProducts({
    search: debounced,
    category: category ? Number(category) : undefined,
    includeInactive,
    page,
  });
  const low = useLowStock();
  const del = useDeleteProduct();

  const rows = lowStockOnly ? (low.data ?? []) : (list.data?.results ?? []);
  const loading = lowStockOnly ? low.isLoading : list.isLoading;
  const error = lowStockOnly ? low.error : list.error;

  const openNew = () => {
    setEditing(null);
    openForm();
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    openForm();
  };
  const openAdjustFor = (p: Product) => {
    setAdjusting(p);
    openAdjust();
  };

  const confirmDelete = (p: Product) =>
    modals.openConfirmModal({
      title: "Eliminar producto",
      children: `¿Marcar "${p.name}" como inactivo?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(p.id);
          notifications.show({ color: "green", message: "Producto eliminado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<Product>[] = [
    { header: "SKU", render: (p) => p.sku },
    { header: "Nombre", render: (p) => p.name },
    {
      header: "Categoría",
      render: (p) => (p.category ? (catName.get(p.category) ?? "—") : "—"),
    },
    { header: "Stock", align: "right", render: (p) => p.stock_quantity },
    {
      header: "Disp.",
      align: "right",
      render: (p) => p.available_quantity ?? p.stock_quantity,
    },
    { header: "Mín.", align: "right", render: (p) => p.minimum_stock },
    {
      header: "Precio",
      align: "right",
      render: (p) => formatCurrency(p.sale_price),
    },
    {
      header: "Estado",
      render: (p) => (
        <Badge color={p.is_active ? "green" : "gray"} variant="light">
          {p.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      header: "",
      align: "right",
      render: (p) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            title="Ajustar stock"
            onClick={() => openAdjustFor(p)}
          >
            <IconAdjustments size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={() => navigate(`/inventory/${p.id}`)}>
            <IconEye size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={() => openEdit(p)}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(p)}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.count / PAGE_SIZE))
    : 1;

  return (
    <Stack>
      <PageHeader
        title="Inventario"
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Nuevo producto
          </Button>
        }
      />
      <Group justify="space-between">
        <Group>
          <TextInput
            placeholder="Buscar por SKU, nombre, código, marca o modelo"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            w={360}
            disabled={lowStockOnly}
          />
          <Select
            placeholder="Categoría"
            data={(categories.data ?? []).map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            clearable
            searchable
            disabled={lowStockOnly}
            w={200}
          />
        </Group>
        <Group>
          <Switch
            label="Solo bajo stock"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.currentTarget.checked)}
          />
          <Switch
            label="Incluir inactivos"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.currentTarget.checked);
              setPage(1);
            }}
            disabled={lowStockOnly}
          />
        </Group>
      </Group>

      {lowStockOnly && (
        <Text size="sm" c="dimmed">
          Productos con stock disponible ≤ stock mínimo.
        </Text>
      )}

      {error ? (
        <Alert color="red">No se pudo cargar el inventario.</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          rowKey={(p) => p.id}
          emptyText="No hay productos."
        />
      )}

      {!lowStockOnly && totalPages > 1 && (
        <Group justify="flex-end">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}

      <ProductFormModal opened={formOpen} onClose={closeForm} product={editing} />
      <AdjustStockModal opened={adjustOpen} onClose={closeAdjust} product={adjusting} />
    </Stack>
  );
}
