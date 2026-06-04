import {
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import { useProducts } from "../inventory/api";
import { useAddPart } from "./api";

export function AddPartModal({
  opened,
  onClose,
  orderId,
}: {
  opened: boolean;
  onClose: () => void;
  orderId: number;
}) {
  const add = useAddPart(orderId);
  const products = useProducts({});
  const [product, setProduct] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unitPrice, setUnitPrice] = useState<number | string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (opened) {
      setProduct(null);
      setQuantity(1);
      setUnitPrice("");
      setNotes("");
    }
  }, [opened]);

  const submit = async () => {
    if (!product) {
      notifications.show({ color: "red", message: "Selecciona un producto." });
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
    <Modal opened={opened} onClose={onClose} title="Agregar pieza" size="md">
      <Grid>
        <Grid.Col span={12}>
          <Select
            label="Producto"
            withAsterisk
            data={(products.data?.results ?? []).map((p) => ({
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
