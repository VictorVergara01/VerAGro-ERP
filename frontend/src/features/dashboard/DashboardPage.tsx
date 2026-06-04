import {
  Alert,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconBox,
  IconCash,
  IconCircleCheck,
  IconClockPause,
  IconReceipt,
  IconTool,
} from "@tabler/icons-react";

import { formatCurrency } from "../../utils/format";
import { StatCard } from "./StatCard";
import { OPEN_STATUSES, sumStatuses, useDashboard } from "./useDashboard";

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <Stack>
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={120} radius="md" />
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  if (error) {
    const forbidden = (error as Error).message === "forbidden";
    return (
      <Stack>
        <Title order={2}>Dashboard</Title>
        <Alert
          color={forbidden ? "yellow" : "red"}
          icon={<IconAlertTriangle size={18} />}
          title={forbidden ? "Sin acceso" : "Error"}
        >
          {forbidden
            ? "Tu rol no tiene acceso al panel financiero. Contacta a un administrador."
            : "No se pudo cargar el dashboard. Intenta de nuevo."}
        </Alert>
      </Stack>
    );
  }

  if (!data) return null;

  const openOrders = sumStatuses(data.service_orders_by_status, OPEN_STATUSES);
  const waitingParts = data.service_orders_by_status["waiting_parts"] ?? 0;
  const finishedThisMonth =
    data.service_orders_by_status["finished"] ?? 0;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Dashboard</Title>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <StatCard
          label="Órdenes abiertas"
          value={openOrders}
          icon={<IconTool size={24} />}
          color="blue"
        />
        <StatCard
          label="Esperando piezas"
          value={waitingParts}
          icon={<IconClockPause size={24} />}
          color="orange"
        />
        <StatCard
          label="Facturas pendientes"
          value={data.invoices.pending_count}
          hint={formatCurrency(data.invoices.pending_amount)}
          icon={<IconReceipt size={24} />}
          color="grape"
        />
        <StatCard
          label="Piezas bajo stock"
          value={data.inventory.low_stock_count}
          icon={<IconBox size={24} />}
          color="red"
        />
        <StatCard
          label="Ventas del mes"
          value={formatCurrency(data.invoices.sales_this_month)}
          icon={<IconCash size={24} />}
          color="green"
        />
        <StatCard
          label="Servicios terminados"
          value={finishedThisMonth}
          icon={<IconCircleCheck size={24} />}
          color="teal"
        />
      </SimpleGrid>
    </Stack>
  );
}
