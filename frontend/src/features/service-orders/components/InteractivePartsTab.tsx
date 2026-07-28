import { Alert, Card, Grid, Loader, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";

import type { ServiceOrder } from "../types";
import { useAddPart, useCompatibleProducts, useOrderComponentTree } from "../api";
import type { ComponentTreeNode } from "../despieceTypes";
import { CompatibleProductsPanel } from "./CompatibleProductsPanel";
import { EquipmentComponentTree } from "./EquipmentComponentTree";
import { EquipmentDiagram } from "./EquipmentDiagram";

const TERMINAL = ["finished", "invoiced", "delivered", "cancelled"];

// Aplana el árbol en índices: id→nodo, id→códigos (propio + ancestros), code→id.
function indexTree(nodes: ComponentTreeNode[]) {
  const byId = new Map<number, ComponentTreeNode>();
  const ancestorCodes = new Map<number, Set<string>>();
  const idByCode = new Map<string, number>();
  const walk = (node: ComponentTreeNode, parentCodes: string[]) => {
    byId.set(node.id, node);
    idByCode.set(node.code, node.id);
    const codes = new Set([...parentCodes, node.code, node.diagram_key].filter(Boolean));
    ancestorCodes.set(node.id, codes);
    node.children.forEach((c) => walk(c, [...parentCodes, node.code, node.diagram_key]));
  };
  nodes.forEach((n) => walk(n, []));
  return { byId, ancestorCodes, idByCode };
}

export function InteractivePartsTab({ order }: { order: ServiceOrder }) {
  const orderId = order.id as number;
  const hasModel = order.equipment_catalog_model != null;
  const treeQ = useOrderComponentTree(hasModel ? orderId : undefined);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const add = useAddPart(orderId);
  const terminal = TERMINAL.includes(order.status ?? "");

  const tree = useMemo(() => treeQ.data ?? [], [treeQ.data]);
  const { ancestorCodes, idByCode } = useMemo(() => indexTree(tree), [tree]);
  const compatQ = useCompatibleProducts(orderId, selectedId ?? undefined);

  const selectedKeys = useMemo(
    () => (selectedId != null ? ancestorCodes.get(selectedId) ?? new Set<string>() : new Set<string>()),
    [selectedId, ancestorCodes],
  );

  const onAdd = async (productId: number, quantity: number) => {
    try {
      await add.mutateAsync({
        product: productId,
        component: selectedId ?? undefined,
        quantity: String(quantity),
      });
      notifications.show({ color: "green", message: "Pieza agregada a la orden." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  if (!hasModel) {
    return (
      <Alert color="yellow" title="Sin modelo técnico">
        El equipo de esta orden no tiene un modelo técnico asignado. Asígnalo en la ficha
        del equipo para usar el despiece.
      </Alert>
    );
  }
  if (treeQ.isLoading) return <Loader />;
  if (treeQ.error)
    return <Alert color="red">{(treeQ.error as Error).message}</Alert>;

  const modelCode = deriveModelCode(order.equipment_catalog_model_name);

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 3.5 }}>
        <Card withBorder padding="sm" radius="md">
          <Text fw={600} size="sm" mb="xs">Componentes</Text>
          <EquipmentComponentTree
            nodes={tree}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4.5 }}>
        <Card withBorder padding="sm" radius="md">
          <Text fw={600} size="sm" mb="xs">Diagrama</Text>
          <EquipmentDiagram
            modelCode={modelCode}
            selectedKeys={selectedKeys}
            onZoneSelect={(key) => {
              const id = idByCode.get(key);
              if (id != null) setSelectedId(id);
            }}
          />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="sm" radius="md">
          <Text fw={600} size="sm" mb="xs">Piezas compatibles</Text>
          <CompatibleProductsPanel
            data={selectedId != null ? compatQ.data : undefined}
            isLoading={compatQ.isLoading}
            disabled={terminal}
            onAdd={onAdd}
          />
        </Card>
      </Grid.Col>
    </Grid>
  );
}

// Deriva el código de modelo para elegir el diagrama, desde el nombre del modelo.
function deriveModelCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("t50")) return "T50";
  if (n.includes("d12500")) return "D12500IE";
  return null;
}
