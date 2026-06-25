import { Card, Grid, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { BarChart, DonutChart } from "@mantine/charts";
import "@mantine/charts/styles.css";

import { formatCurrency } from "../../utils/format";

export interface DashboardChartsProps {
  ordersByStatus: { estado: string; Órdenes: number }[];
  billing: { name: string; value: number; color: string }[];
  total: number;
}

// Bloque de gráficos del panel financiero. Vive en su propio módulo para
// cargarse con React.lazy: recharts (~125 kB gzip) solo baja cuando este
// componente se renderiza, no en el arranque ni para roles operativos.
export default function DashboardCharts({
  ordersByStatus,
  billing,
  total,
}: DashboardChartsProps) {
  return (
    <Grid>
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Card>
          <Text fw={600} mb="md">
            Órdenes por estado
          </Text>
          {ordersByStatus.length ? (
            <BarChart
              h={300}
              data={ordersByStatus}
              dataKey="estado"
              series={[{ name: "Órdenes", color: "green.6" }]}
              tickLine="y"
              gridAxis="y"
              barProps={{ radius: 6 }}
            />
          ) : (
            <Text c="dimmed" size="sm">
              Sin órdenes registradas.
            </Text>
          )}
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Card h="100%">
          <Text fw={600} mb="md">
            Facturación del mes
          </Text>
          {billing.length ? (
            <Stack align="center" gap="xs">
              <DonutChart
                data={billing}
                h={200}
                thickness={26}
                chartLabel={formatCurrency(total)}
                withTooltip
              />
              <Group gap="lg">
                {billing.map((b) => (
                  <Group key={b.name} gap={6}>
                    <ThemeIcon size={12} radius="xl" color={b.color}>
                      <span />
                    </ThemeIcon>
                    <Text size="sm" c="dimmed">
                      {b.name}
                    </Text>
                  </Group>
                ))}
              </Group>
            </Stack>
          ) : (
            <Text c="dimmed" size="sm">
              Sin facturación este mes.
            </Text>
          )}
        </Card>
      </Grid.Col>
    </Grid>
  );
}
