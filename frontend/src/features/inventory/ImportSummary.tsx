import { Alert, Group, Stack, Table, Text } from "@mantine/core";

import type { ImportResult } from "./importExport";

export function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <Stack gap="sm">
      <Group>
        <Alert color="green" variant="light" style={{ flex: 1 }}>
          <Text fw={700}>{result.creados}</Text>
          <Text size="sm">creados</Text>
        </Alert>
        <Alert color="yellow" variant="light" style={{ flex: 1 }}>
          <Text fw={700}>{result.saltados}</Text>
          <Text size="sm">saltados</Text>
        </Alert>
      </Group>

      {result.errores.length > 0 && (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fila</Table.Th>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Motivo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.errores.map((e, i) => (
              <Table.Tr key={i}>
                <Table.Td>{e.fila}</Table.Td>
                <Table.Td>{e.sku || "—"}</Table.Td>
                <Table.Td>{e.motivo}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
