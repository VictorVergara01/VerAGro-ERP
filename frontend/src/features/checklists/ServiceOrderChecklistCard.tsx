import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useProducts } from "../inventory/api";
import {
  useChecklistTemplates,
  useCompleteChecklist,
  useFillChecklist,
  useInstantiateChecklist,
  useOrderChecklists,
  type FillItemInput,
} from "./api";
import {
  ITEM_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  type ServiceChecklist,
  type ServiceChecklistItem,
} from "./types";

type EditMap = Record<number, FillItemInput>;

function ChecklistBlock({
  checklist,
  orderId,
  editable,
  productOptions,
}: {
  checklist: ServiceChecklist;
  orderId: number;
  editable: boolean;
  productOptions: { value: string; label: string }[];
}) {
  const fill = useFillChecklist(orderId);
  const complete = useCompleteChecklist(orderId);
  const [edits, setEdits] = useState<EditMap>({});

  useEffect(() => {
    const m: EditMap = {};
    for (const it of checklist.items ?? []) {
      m[it.id] = {
        id: it.id,
        status: it.status ?? "pending",
        priority: it.priority ?? "",
        recommended_product: it.recommended_product ?? null,
      };
    }
    setEdits(m);
  }, [checklist.items]);

  const setField = (id: number, field: keyof FillItemInput, value: unknown) =>
    setEdits((s) => ({ ...s, [id]: { ...s[id], [field]: value } }));

  const save = async () => {
    try {
      await fill.mutateAsync({
        checklistId: checklist.id,
        items: Object.values(edits),
      });
      notifications.show({ color: "green", message: "Checklist guardado." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const doComplete = async () => {
    try {
      await complete.mutateAsync(checklist.id);
      notifications.show({ color: "green", message: "Checklist completado." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm">
        <Group>
          <Text fw={600}>{checklist.template_name}</Text>
          {checklist.completed_at ? (
            <Badge color="green" variant="light">
              Completado
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              En progreso
            </Badge>
          )}
        </Group>
        {editable && (
          <Group>
            <Button size="xs" variant="light" onClick={save} loading={fill.isPending}>
              Guardar
            </Button>
            <Button
              size="xs"
              color="green"
              onClick={doComplete}
              loading={complete.isPending}
            >
              Completar
            </Button>
          </Group>
        )}
      </Group>
      <Table.ScrollContainer minWidth={700}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ítem</Table.Th>
              <Table.Th w={170}>Estado</Table.Th>
              <Table.Th w={120}>Prioridad</Table.Th>
              <Table.Th w={220}>Pieza recomendada</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(checklist.items ?? []).map((it: ServiceChecklistItem) => {
              const e: FillItemInput = edits[it.id] ?? { id: it.id };
              return (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.item_name}</Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={ITEM_STATUS_OPTIONS}
                      value={e.status ?? "pending"}
                      onChange={(v) => setField(it.id, "status", v ?? "pending")}
                      disabled={!editable}
                      allowDeselect={false}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={PRIORITY_OPTIONS}
                      value={e.priority ?? ""}
                      onChange={(v) => setField(it.id, "priority", v ?? "")}
                      disabled={!editable}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      placeholder="—"
                      data={productOptions}
                      searchable
                      clearable
                      value={e.recommended_product ? String(e.recommended_product) : null}
                      onChange={(v) =>
                        setField(it.id, "recommended_product", v ? Number(v) : null)
                      }
                      disabled={!editable}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

export function ServiceOrderChecklistCard({
  orderId,
  editable,
}: {
  orderId: number;
  editable: boolean;
}) {
  const checklists = useOrderChecklists(orderId);
  const templates = useChecklistTemplates();
  const products = useProducts({});
  const instantiate = useInstantiateChecklist(orderId);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const productOptions = (products.data?.results ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.sku} · ${p.name}`,
  }));

  const add = async () => {
    if (!templateId) return;
    try {
      await instantiate.mutateAsync(Number(templateId));
      notifications.show({ color: "green", message: "Checklist agregado." });
      setTemplateId(null);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={600}>Checklists</Text>
        {editable && (
          <Group>
            <Select
              placeholder="Plantilla"
              data={(templates.data ?? []).map((t) => ({
                value: String(t.id),
                label: t.name,
              }))}
              value={templateId}
              onChange={(v) => setTemplateId(v)}
              searchable
              w={260}
            />
            <Button
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={add}
              loading={instantiate.isPending}
              disabled={!templateId}
            >
              Agregar
            </Button>
          </Group>
        )}
      </Group>

      {(checklists.data ?? []).length === 0 ? (
        <Text c="dimmed" size="sm">
          Esta orden no tiene checklists.
        </Text>
      ) : (
        (checklists.data ?? []).map((cl) => (
          <ChecklistBlock
            key={cl.id}
            checklist={cl}
            orderId={orderId}
            editable={editable}
            productOptions={productOptions}
          />
        ))
      )}
    </Stack>
  );
}
