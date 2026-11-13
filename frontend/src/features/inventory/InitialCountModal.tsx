import { Alert, Button, Group, Loader, Modal, NumberInput, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { formatCurrency, formatDate } from "../../utils/format";
import { useInitialStockCount, useRecordInitialCount } from "./api";
import type { Product } from "./types";

export function InitialCountModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved?: () => void }) {
  const counted = Boolean(product.initial_counted_at);
  const savedCount = useInitialStockCount(product.id, counted);
  const save = useRecordInitialCount(product.id);
  const [error, setError] = useState("");
  const form = useForm({
    initialValues: {
      quantity: "" as number | string,
      unit_cost: Number(product.average_cost) > 0 ? product.average_cost : "" as number | string,
      location: product.location ?? "", notes: "",
    },
    validate: {
      quantity: (v) => v === "" || Number(v) < 0 ? "Indica la cantidad física, incluso si es cero." : null,
      unit_cost: (v, values) => Number(values.quantity) > 0 && !(Number(v) > 0) ? "Indica el costo unitario de las existencias." : null,
    },
  });
  const submit = form.onSubmit(async (values) => {
    setError("");
    try {
      await save.mutateAsync({
        quantity: String(values.quantity), unit_cost: Number(values.quantity) > 0 ? String(values.unit_cost) : null,
        location: values.location, notes: values.notes, expected_updated_at: product.updated_at,
      });
      notifications.show({ color: "green", message: Number(values.quantity) === 0 ? "Producto contado: cero unidades." : "Conteo inicial guardado." });
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  });
  return <Modal opened onClose={onClose} title={counted ? "Conteo inicial registrado" : "Registrar conteo físico"} size="md">
    <Stack>
      <Text fw={600}>{product.sku} · {product.name}</Text>
      {product.part_number && <Text size="sm">Número de pieza: {product.part_number}</Text>}
      {counted ? <>
        {savedCount.isLoading && <Loader size="sm" />}
        {savedCount.error && <Alert color="red">No se pudo cargar el conteo.</Alert>}
        {savedCount.data && <>
          <Text>Cantidad contada: <b>{savedCount.data.counted_quantity}</b></Text>
          <Text>Costo unitario: {savedCount.data.unit_cost ? formatCurrency(savedCount.data.unit_cost) : "Sin existencias al contar"}</Text>
          <Text>Ubicación: {savedCount.data.location || "Sin indicar"}</Text>
          <Text>Registrado: {formatDate(savedCount.data.created_at)} · {savedCount.data.counted_by_name || "Usuario no disponible"}</Text>
          {savedCount.data.notes && <Text>Notas: {savedCount.data.notes}</Text>}
          <Alert color="blue">Este conteo ya está guardado. Las entradas y salidas posteriores se gestionan con compras, trabajos y ajustes.</Alert>
        </>}
        <Button variant="default" onClick={onClose}>Cerrar</Button>
      </> : <form onSubmit={submit}><Stack>
        <Alert color="blue">Registra todas las unidades físicas de este producto. Esta cantidad establece el saldo inicial; no se suma al número que aparece en el sistema. Puedes registrar cero.</Alert>
        <NumberInput label="Cantidad contada" required min={0} decimalScale={2} {...form.getInputProps("quantity")} />
        <NumberInput label="Costo unitario ($)" description="Obligatorio si hay existencias. Se usa para valorar el inventario y calcular precios según tus márgenes." min={0} decimalScale={2} disabled={form.values.quantity !== "" && Number(form.values.quantity) === 0} {...form.getInputProps("unit_cost")} />
        <TextInput label="Ubicación" placeholder="Bodega, estante o gaveta" maxLength={100} {...form.getInputProps("location")} />
        <Textarea label="Notas del conteo (opcional)" {...form.getInputProps("notes")} />
        {Number(product.reserved_quantity) > 0 && <Alert color="orange">Hay {product.reserved_quantity} unidades reservadas. La cantidad física debe incluir las que siguen en tu poder.</Alert>}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancelar</Button><Button type="submit" loading={save.isPending}>Guardar conteo</Button></Group>
      </Stack></form>}
    </Stack>
  </Modal>;
}
