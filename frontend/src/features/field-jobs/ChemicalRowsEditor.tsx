import { ActionIcon, Button, Group, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import { PRODUCT_UNIT_OPTIONS } from "./types";

export interface ChemicalRow {
  name: string;
  dose_per_hectare: number | string;
  unit: string;
}

export const MAX_CHEMICALS = 10;

/** Editor de filas de químicos, compartido por el form del trabajo y el del lote. */
export function ChemicalRowsEditor({
  rows,
  onChange,
  title = "Químicos a aplicar",
  maxNote = `Máximo ${MAX_CHEMICALS} químicos por trabajo.`,
}: {
  rows: ChemicalRow[];
  onChange: (rows: ChemicalRow[]) => void;
  title?: string;
  maxNote?: string;
}) {
  const patch = (i: number, field: keyof ChemicalRow, value: string | number) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  return (
    <>
      <Text fw={600} size="sm" mt="sm">{title}</Text>
      {rows.map((p, i) => (
        <Group key={i} wrap="nowrap" mt={4}>
          <TextInput
            placeholder="Nombre del químico"
            value={p.name}
            onChange={(e) => patch(i, "name", e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <NumberInput
            placeholder="Dosis/ha"
            min={0}
            decimalScale={4}
            value={p.dose_per_hectare}
            onChange={(v) => patch(i, "dose_per_hectare", v as number | string)}
            w={120}
          />
          <Select
            data={PRODUCT_UNIT_OPTIONS}
            value={p.unit}
            onChange={(v) => patch(i, "unit", v ?? "L/ha")}
            allowDeselect={false}
            w={100}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Quitar químico"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        variant="light"
        size="xs"
        mt={4}
        leftSection={<IconPlus size={16} />}
        disabled={rows.length >= MAX_CHEMICALS}
        onClick={() => onChange([...rows, { name: "", dose_per_hectare: 0, unit: "L/ha" }])}
      >
        Agregar químico
      </Button>
      {rows.length >= MAX_CHEMICALS && (
        <Text size="xs" c="dimmed" mt={4}>{maxNote}</Text>
      )}
    </>
  );
}
