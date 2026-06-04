import { Center, Loader, Table, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  /** Render de la celda; recibe la fila completa. */
  render: (row: T) => ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
}

export function DataTable<T>({
  columns,
  rows,
  loading = false,
  emptyText = "Sin resultados.",
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string | number;
}) {
  return (
    <Table.ScrollContainer minWidth={600}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            {columns.map((c, i) => (
              <Table.Th key={i} style={{ width: c.width, textAlign: c.align }}>
                {c.header}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <Table.Tr>
              <Table.Td colSpan={columns.length}>
                <Center py="xl">
                  <Loader size="sm" />
                </Center>
              </Table.Td>
            </Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={columns.length}>
                <Text c="dimmed" ta="center" py="lg">
                  {emptyText}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((row) => (
              <Table.Tr key={rowKey(row)}>
                {columns.map((c, i) => (
                  <Table.Td key={i} style={{ textAlign: c.align }}>
                    {c.render(row)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
