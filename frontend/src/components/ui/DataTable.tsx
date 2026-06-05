import { Box, Card, Center, Loader, rem, Table, Text } from "@mantine/core";
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
  onRowClick,
  toolbar,
  footer,
  minWidth = 600,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string | number;
  /** Si se pasa, las filas son clicables. */
  onRowClick?: (row: T) => void;
  /** Barra superior dentro del panel (búsqueda, filtros). */
  toolbar?: ReactNode;
  /** Pie dentro del panel (paginación, totales). */
  footer?: ReactNode;
  minWidth?: number;
}) {
  return (
    <Card padding={0} withBorder radius="lg">
      {toolbar && (
        <Box
          p="md"
          style={{
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          {toolbar}
        </Box>
      )}
      <Table.ScrollContainer minWidth={minWidth}>
        <Table
          highlightOnHover={!!onRowClick || rows.length > 0}
          verticalSpacing="sm"
          horizontalSpacing="md"
          styles={{
            th: {
              textTransform: "uppercase",
              fontSize: rem(11),
              letterSpacing: "0.04em",
              color: "var(--mantine-color-dimmed)",
              fontWeight: 600,
              background: "var(--mantine-color-default-hover)",
            },
          }}
        >
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
                  <Text c="dimmed" ta="center" py="xl">
                    {emptyText}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row) => (
                <Table.Tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: "pointer" } : undefined}
                >
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
      {footer && (
        <Box
          p="md"
          style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
        >
          {footer}
        </Box>
      )}
    </Card>
  );
}
