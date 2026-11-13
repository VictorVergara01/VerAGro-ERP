import { Alert, Button, Group, Modal, Select, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useProducts } from "../inventory/api";
import { useReconcilePart } from "./api";
import type { ServiceOrderPart } from "./types";

export function ReconcilePartModal({ part, orderId, onClose }: {
  part: ServiceOrderPart; orderId: number; onClose: () => void;
}) {
  const [source, setSource] = useState<string | null>(part.status === "pending_inventory" ? "inventory" : "pending");
  const [product, setProduct] = useState<string | null>(part.product ? String(part.product) : null);
  const [search, setSearch] = useState("");
  const products = useProducts({ search, pageSize: 50 });
  const reconcile = useReconcilePart(orderId);
  const options = (products.data?.results ?? []).map((p) => ({ value: String(p.id), label: `${p.sku} · ${p.name}` }));
  if (part.product && !options.some((p) => p.value === String(part.product))) {
    options.push({ value: String(part.product), label: part.product_name || "Producto de la orden" });
  }
  const submit = async () => {
    try {
      await reconcile.mutateAsync({ id: part.id, source: source!, product: ["inventory", "counted"].includes(source!) && product ? Number(product) : undefined });
      notifications.show({ color: "green", message: source === "pending" ? "Pieza pendiente de inventario." : "Pieza conciliada." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };
  return <Modal opened onClose={onClose} title={`Inventario: ${part.product_name}`}>
    <Stack>
      <Select label="Origen de la pieza" value={source} onChange={(v) => setSource(v == null ? null : String(v))} allowDeselect={false} data={
        part.status === "pending_inventory" ? [
          { value: "inventory", label: "Consumir de inventario" },
          { value: "customer", label: "Aportada por el cliente" },
          { value: "external", label: "Compra directa para la reparación" },
          { value: "counted", label: "Ya considerada en el conteo físico" },
        ] : [{ value: "pending", label: "Inventario sin actualizar: conciliar después" }]
      } />
      {["inventory", "counted"].includes(source ?? "") && <Select label="Producto" searchable searchValue={search} onSearchChange={setSearch} data={options} value={product} onChange={(v) => setProduct(v == null ? null : String(v))} />}
      <Alert color="blue">{source === "inventory"
        ? `Se descontarán ${part.quantity} unidades disponibles una sola vez. El importe de la reparación no cambiará.`
        : "No se modificarán las existencias ni el importe de la reparación."}</Alert>
      <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button loading={reconcile.isPending} disabled={!source || (["inventory", "counted"].includes(source) && !product)} onClick={submit}>Guardar</Button></Group>
    </Stack>
  </Modal>;
}
