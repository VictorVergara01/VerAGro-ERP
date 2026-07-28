import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useEquipmentModels } from "../equipment/api";
import {
  useComponentsByModel,
  useDeleteCompatibility,
  useProductCompatibilities,
  useSaveCompatibility,
} from "./api";
import type { Product } from "./types";

export function ProductCompatibilityModal({
  opened,
  onClose,
  product,
}: {
  opened: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const productId = product?.id;
  const models = useEquipmentModels();
  const compatibilities = useProductCompatibilities(productId);
  const save = useSaveCompatibility();
  const del = useDeleteCompatibility(productId);

  const [modelId, setModelId] = useState<string | null>(null);
  const [componentId, setComponentId] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState("");

  const components = useComponentsByModel(modelId ? Number(modelId) : undefined);

  useEffect(() => {
    if (opened) {
      setModelId(null);
      setComponentId(null);
      setIsPrimary(false);
      setNotes("");
    }
  }, [opened]);

  const add = async () => {
    if (!productId || !modelId || !componentId) {
      notifications.show({ color: "red", message: "Elige modelo y componente." });
      return;
    }
    try {
      await save.mutateAsync({
        product: productId,
        equipment_model: Number(modelId),
        component: Number(componentId),
        is_primary: isPrimary,
        notes,
      });
      notifications.show({ color: "green", message: "Compatibilidad agregada." });
      setComponentId(null);
      setIsPrimary(false);
      setNotes("");
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const remove = async (id: number) => {
    try {
      await del.mutateAsync(id);
      notifications.show({ color: "green", message: "Compatibilidad eliminada." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Compatibilidad técnica${product ? ` · ${product.name}` : ""}`}
      size="lg"
    >
      <Stack>
        <Text fw={600} size="sm">
          Compatibilidades registradas
        </Text>
        {(compatibilities.data ?? []).length === 0 ? (
          <Text size="sm" c="dimmed">
            Aún no hay compatibilidades para este producto.
          </Text>
        ) : (
          <Stack gap="xs">
            {(compatibilities.data ?? []).map((c) => (
              <Group key={c.id} justify="space-between" wrap="nowrap">
                <div>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {c.equipment_model_name}
                    </Text>
                    {c.is_primary && (
                      <Badge size="xs" variant="light" color="teal">
                        Principal
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {c.component_path ?? c.component_name}
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label="Eliminar compatibilidad"
                  onClick={() => remove(c.id)}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}

        <Text fw={600} size="sm" mt="sm">
          Agregar compatibilidad
        </Text>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Modelo técnico"
              placeholder="Elige un modelo"
              data={(models.data ?? []).map((m) => ({
                value: String(m.id),
                label: `${m.brand} ${m.name}`,
              }))}
              searchable
              value={modelId}
              onChange={(v) => {
                setModelId(v);
                setComponentId(null);
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Componente"
              placeholder={modelId ? "Elige un componente" : "Elige primero un modelo"}
              data={(components.data ?? []).map((c) => ({
                value: String(c.id),
                label: c.path || c.name,
              }))}
              searchable
              disabled={!modelId}
              value={componentId}
              onChange={(v) => setComponentId(v)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput
              label="Notas"
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }} mt="lg">
            <Switch
              label="Compatibilidad principal"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.currentTarget.checked)}
            />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end">
          <Button onClick={add} loading={save.isPending}>
            Agregar compatibilidad
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
