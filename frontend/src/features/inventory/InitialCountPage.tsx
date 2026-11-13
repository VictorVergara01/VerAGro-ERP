import { Alert, Badge, Button, Card, Group, Pagination, Progress, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { PAGE_SIZE } from "../../lib/api/types";
import { useAuth } from "../auth/useAuth";
import { canWriteInventory } from "../auth/roles";
import { useEquipmentModels } from "../equipment/api";
import { useCategories, useInitialCountProgress, useProducts } from "./api";
import { InitialCountModal } from "./InitialCountModal";
import { productCategoryIds, type Product } from "./types";

export function InitialCountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = canWriteInventory(user?.role);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [category, setCategory] = useState<string | null>(null);
  const [equipmentModel, setEquipmentModel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>("uncounted");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const categories = useCategories({ equipmentModel: equipmentModel ? Number(equipmentModel) : undefined });
  const models = useEquipmentModels();
  const scope = { search: debounced, category: category ? Number(category) : undefined, equipmentModel: equipmentModel ? Number(equipmentModel) : undefined };
  const products = useProducts({ ...scope, countStatus: (status ?? undefined) as "uncounted" | "counted" | "zero" | undefined, page });
  const progress = useInitialCountProgress(scope);
  const categoryNames = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const rows = products.data?.results ?? [];
  const count = progress.data;
  const percentage = count?.total ? count.counted / count.total * 100 : 0;
  const columns: Column<Product>[] = [
    { header: "Producto", render: (p) => <Stack gap={0}><Text fw={500}>{p.name}</Text><Text size="xs" c="dimmed">{p.sku}{p.part_number ? ` · ${p.part_number}` : ""}</Text></Stack> },
    { header: "Categorías / secciones", render: (p) => productCategoryIds(p).map((id) => categoryNames.get(id) ?? `#${id}`).join(", ") || "—" },
    { header: "Ubicación", render: (p) => p.location || "Sin indicar" },
    { header: "Conteo inicial", render: (p) => <Badge color={!p.initial_counted_at ? "orange" : Number(p.initial_counted_quantity) === 0 ? "gray" : "green"}>
      {!p.initial_counted_at ? "Sin contar" : Number(p.initial_counted_quantity) === 0 ? "Contado en cero" : `Contado: ${p.initial_counted_quantity}`}
    </Badge> },
    { header: "Existencias actuales", align: "right", render: (p) => p.initial_counted_at ? p.stock_quantity : "Pendiente de verificar" },
    { header: "", align: "right", render: (p) => p.initial_counted_at || canWrite
      ? <Button size="xs" variant={p.initial_counted_at ? "light" : "filled"} onClick={() => setSelected(p)}>{p.initial_counted_at ? "Ver conteo" : "Registrar conteo"}</Button>
      : <Text size="xs" c="dimmed">Solo lectura</Text> },
  ];
  return <Stack>
    <PageHeader title="Conteo físico inicial" subtitle="Conserva tu catálogo y registra las existencias reales, producto por producto."
      action={<Button variant="default" onClick={() => navigate("/inventory")}>Volver al inventario</Button>} />
    <Alert color="blue">Sin contar significa pendiente de revisión. Contado en cero confirma que revisaste y no encontraste unidades. Las piezas usadas antes del conteo pueden conciliarse en el taller como «ya consideradas en el conteo físico».</Alert>
    {progress.error ? <Alert color="red">No se pudo cargar el avance del conteo.</Alert> : <>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {[['Productos del catálogo', count?.total], ['Sin contar', count?.uncounted], ['Contados', count?.counted], ['Contados en cero', count?.counted_zero]].map(([label, value]) =>
          <Card key={String(label)} withBorder><Text size="sm" c="dimmed">{label}</Text><Text fw={700} size="xl">{value ?? "—"}</Text></Card>)}
      </SimpleGrid>
      <Progress value={percentage} aria-label="Avance del conteo" />
      <Text size="sm" c="dimmed">{percentage.toFixed(0)}% contado en la categoría y modelo seleccionados.</Text>
    </>}
    {products.error ? <Alert color="red">No se pudo cargar el catálogo.</Alert> : <DataTable columns={columns} rows={rows} loading={products.isLoading} rowKey={(p) => p.id} minWidth={900} emptyText="No hay productos para este filtro."
      toolbar={<Group>
        <TextInput aria-label="Buscar producto para contar" placeholder="Nombre, SKU o número de pieza" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} w={280} />
        <Select aria-label="Categoría" placeholder="Todas las categorías" data={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} value={category} onChange={(v) => { setCategory(v); setPage(1); }} clearable searchable />
        <Select aria-label="Modelo de dron" placeholder="Todos los modelos" data={(models.data ?? []).map((m) => ({ value: String(m.id), label: `${m.brand} ${m.name}` }))} value={equipmentModel} onChange={(v) => { setEquipmentModel(v); setCategory(null); setPage(1); }} clearable searchable />
        <Select aria-label="Estado del conteo" data={[{ value: "uncounted", label: "Sin contar" }, { value: "counted", label: "Contados" }, { value: "zero", label: "Contados en cero" }]} value={status} placeholder="Todos los estados" onChange={(v) => { setStatus(v); setPage(1); }} clearable />
      </Group>}
      footer={(products.data?.count ?? 0) > PAGE_SIZE && <Group justify="flex-end"><Pagination value={page} total={Math.ceil((products.data?.count ?? 0) / PAGE_SIZE)} onChange={setPage} /></Group>}
    />}
    {selected && <InitialCountModal key={selected.id} product={selected} onClose={() => setSelected(null)} onSaved={() => { if (rows.length === 1 && page > 1) setPage(page - 1); }} />}
  </Stack>;
}
