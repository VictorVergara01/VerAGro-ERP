import {
  Button,
  Chip,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";

import { useEquipmentTypes } from "../equipment/api";
import { useCategories, useProducts } from "../inventory/api";
import { useAddPart } from "./api";

export function AddPartModal({
  opened,
  onClose,
  orderId,
  equipmentType,
  equipmentTypeName,
}: {
  opened: boolean;
  onClose: () => void;
  orderId: number;
  equipmentType?: number | null;
  equipmentTypeName?: string | null;
}) {
  const add = useAddPart(orderId);
  const types = useEquipmentTypes();
  const categories = useCategories();

  const [modelType, setModelType] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unitPrice, setUnitPrice] = useState<number | string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (opened) {
      setModelType(equipmentType != null ? String(equipmentType) : null);
      setShowAll(false);
      setCategoryId(null);
      setProduct(null);
      setQuantity(1);
      setUnitPrice("");
      setNotes("");
    }
  }, [opened, equipmentType]);

  // Una sola consulta por modelo; categorías y piezas se filtran en memoria.
  const filterType = showAll || !modelType ? undefined : Number(modelType);
  const products = useProducts({ equipmentType: filterType, pageSize: 200 });
  const productList = useMemo(() => products.data?.results ?? [], [products.data]);

  const categoryName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categories.data]);

  const categoryChips = useMemo(() => {
    const ids = new Set<number>();
    for (const p of productList) {
      if (p.category != null) ids.add(p.category as number);
    }
    return [...ids]
      .map((id) => ({ id, name: categoryName.get(id) ?? `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [productList, categoryName]);

  const filteredProducts = categoryId
    ? productList.filter((p) => String(p.category) === categoryId)
    : productList;

  const submit = async () => {
    if (!product) {
      notifications.show({ color: "red", message: "Selecciona una pieza." });
      return;
    }
    try {
      await add.mutateAsync({
        product: Number(product),
        quantity: String(quantity || 0),
        unit_price: unitPrice !== "" ? String(unitPrice) : undefined,
        notes,
      });
      notifications.show({ color: "green", message: "Pieza agregada." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Agregar pieza" size="lg">
      <Grid>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <Select
            label="Modelo"
            placeholder="Elige un modelo"
            data={(types.data ?? []).map((t) => ({
              value: String(t.id),
              label: t.name,
            }))}
            searchable
            clearable
            value={modelType}
            disabled={showAll}
            onChange={(v) => {
              setModelType(v);
              setCategoryId(null);
              setProduct(null);
            }}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }} style={{ display: "flex", alignItems: "flex-end" }}>
          <Switch
            label="Ver todas las piezas"
            checked={showAll}
            onChange={(e) => {
              setShowAll(e.currentTarget.checked);
              setCategoryId(null);
              setProduct(null);
            }}
          />
        </Grid.Col>

        <Grid.Col span={12}>
          <Text size="sm" fw={500} mb={4}>
            Categoría
          </Text>
          {categoryChips.length === 0 ? (
            <Text size="sm" c="dimmed">
              {productList.length === 0
                ? equipmentTypeName
                  ? `No hay piezas etiquetadas para ${equipmentTypeName}. Activa “Ver todas las piezas”.`
                  : "Elige un modelo o activa “Ver todas las piezas”."
                : "Sin categorías."}
            </Text>
          ) : (
            <Chip.Group
              multiple={false}
              value={categoryId ?? ""}
              onChange={(v) => {
                setCategoryId((v as string) || null);
                setProduct(null);
              }}
            >
              <Group gap="xs">
                {categoryChips.map((c) => (
                  <Chip key={c.id} value={String(c.id)}>
                    {c.name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}
        </Grid.Col>

        <Grid.Col span={12}>
          <Select
            label="Pieza"
            withAsterisk
            placeholder="Busca la pieza"
            data={filteredProducts.map((p) => ({
              value: String(p.id),
              label: `${p.sku} · ${p.name}`,
            }))}
            searchable
            value={product}
            onChange={(v) => setProduct(v)}
          />
        </Grid.Col>

        <Grid.Col span={6}>
          <NumberInput
            label="Cantidad"
            min={0}
            decimalScale={2}
            value={quantity}
            onChange={(v) => setQuantity(v as number | string)}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <NumberInput
            label="Precio unitario (opcional)"
            min={0}
            decimalScale={2}
            value={unitPrice}
            onChange={(v) => setUnitPrice(v as number | string)}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput
            label="Notas"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
        </Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} loading={add.isPending}>
          Agregar
        </Button>
      </Group>
    </Modal>
  );
}
