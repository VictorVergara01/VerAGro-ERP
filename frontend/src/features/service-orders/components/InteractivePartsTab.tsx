import {
  Alert,
  Chip,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type { ServiceOrder } from "../types";
import { useAddPart, useCompatibleProducts } from "../api";
import type { CompatibleProduct, PartComponent } from "../despieceTypes";
import { CompatiblePartCard } from "./CompatiblePartCard";

const TERMINAL = ["finished", "invoiced", "delivered", "cancelled"];

// Minúsculas y sin acentos: "Hélice" y "helice" deben coincidir.
function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Incluye la categoría: los nombres del catálogo DJI vienen en inglés
// ("Upper Propeller") y las categorías en español ("Hélices").
function matches(product: CompatibleProduct, term: string) {
  if (!term) return true;
  return [product.name, product.sku, product.part_number, product.component.path].some(
    (field) => fold(field ?? "").includes(term),
  );
}

function ChipLabel({ name, count }: { name: string; count: number }) {
  return (
    <>
      {name}
      <Text span size="xs" ml={6} style={{ opacity: 0.7 }}>
        {count}
      </Text>
    </>
  );
}

export function InteractivePartsTab({ order }: { order: ServiceOrder }) {
  const orderId = order.id as number;
  const hasModel = order.equipment_catalog_model != null;
  const partsQ = useCompatibleProducts(hasModel ? orderId : undefined);
  const add = useAddPart(orderId);
  const terminal = TERMINAL.includes(order.status ?? "");

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const products = useMemo(() => partsQ.data?.products ?? [], [partsQ.data]);

  // Categorías en el orden en que las entrega el backend (sort_order, nombre).
  const categories = useMemo(() => {
    const seen = new Map<number, PartComponent>();
    for (const p of products) if (!seen.has(p.component.id)) seen.set(p.component.id, p.component);
    return [...seen.values()];
  }, [products]);

  const term = fold(search.trim());
  const searched = useMemo(() => products.filter((p) => matches(p, term)), [products, term]);

  const countByCategory = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of searched) counts.set(p.component.id, (counts.get(p.component.id) ?? 0) + 1);
    return counts;
  }, [searched]);

  const groups = categories
    .filter((c) => selected.length === 0 || selected.includes(String(c.id)))
    .map((c) => ({ component: c, items: searched.filter((p) => p.component.id === c.id) }))
    .filter((g) => g.items.length > 0);

  const onAdd = async (product: CompatibleProduct, quantity: number) => {
    try {
      await add.mutateAsync({
        product: product.id,
        component: product.component.id,
        quantity: String(quantity),
      });
      notifications.show({ color: "green", message: `${product.name} agregada a la orden.` });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  if (!hasModel) {
    return (
      <Alert color="yellow" title="Sin modelo técnico">
        El equipo de esta orden no tiene un modelo técnico asignado. Asígnalo en la ficha
        del equipo para ver sus piezas.
      </Alert>
    );
  }
  if (partsQ.isLoading) return <Loader />;
  if (partsQ.error) return <Alert color="red">{(partsQ.error as Error).message}</Alert>;

  if (products.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="lg">
        No hay piezas registradas para {partsQ.data?.equipment_model.name ?? "este modelo"}.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {partsQ.data?.equipment_model.name} · {products.length} piezas
      </Text>

      <TextInput
        placeholder="Buscar pieza, SKU o N.º de pieza…"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        aria-label="Buscar pieza"
      />

      <Group gap="xs">
        <Chip checked={selected.length === 0} onChange={() => setSelected([])}>
          <ChipLabel name="Todas" count={searched.length} />
        </Chip>
        <Chip.Group multiple value={selected} onChange={setSelected}>
          {categories.map((c) => (
            <Chip key={c.id} value={String(c.id)}>
              <ChipLabel name={c.name} count={countByCategory.get(c.id) ?? 0} />
            </Chip>
          ))}
        </Chip.Group>
      </Group>

      {groups.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          Ninguna pieza coincide con la búsqueda.
        </Text>
      ) : (
        groups.map(({ component, items }) => (
          <Stack key={component.id} gap="xs">
            <Group gap="xs" align="baseline">
              <Title order={5}>{component.path}</Title>
              <Text size="sm" c="dimmed">
                {items.length} {items.length === 1 ? "pieza" : "piezas"}
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="sm">
              {items.map((p) => (
                <CompatiblePartCard key={p.id} product={p} disabled={terminal} onAdd={onAdd} />
              ))}
            </SimpleGrid>
          </Stack>
        ))
      )}
    </Stack>
  );
}
