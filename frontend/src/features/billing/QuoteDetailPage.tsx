import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconEdit } from "@tabler/icons-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { formatCurrency, formatDate } from "../../utils/format";
import { useConvertQuote, useQuote, useQuoteAction } from "./api";
import { QuoteCreateModal } from "./QuoteCreateModal";
import { QUOTE_STATUS_COLOR, QUOTE_STATUS_LABEL } from "./types";

export function QuoteDetailPage() {
  const { id } = useParams();
  const quoteId = id ? Number(id) : undefined;
  const { data: quote, isLoading, error } = useQuote(quoteId);
  const action = useQuoteAction(quoteId);
  const convert = useConvertQuote(quoteId);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const navigate = useNavigate();

  if (isLoading) return <Loader />;
  if (error || !quote)
    return <Alert color="red">No se pudo cargar la cotización.</Alert>;

  const status = quote.status ?? "draft";
  const editable = status === "draft" || status === "sent";
  const canApprove = status === "draft" || status === "sent";
  const canReject = !["converted_to_invoice", "rejected"].includes(status);
  const canConvert = status === "approved";

  const run = async (a: "approve" | "reject", ok: string) => {
    try {
      await action.mutateAsync(a);
      notifications.show({ color: "green", message: ok });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const doConvert = async () => {
    try {
      const inv = await convert.mutateAsync();
      notifications.show({ color: "green", message: `Factura ${inv.invoice_number} creada.` });
      navigate(`/invoices/${inv.id}`);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Group>
          <Button
            component={Link}
            to="/quotes"
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
          >
            Cotizaciones
          </Button>
          <Text fz={24} fw={700}>
            {quote.quote_number}
          </Text>
          <Badge color={QUOTE_STATUS_COLOR[status]} variant="light" size="lg">
            {QUOTE_STATUS_LABEL[status]}
          </Badge>
        </Group>
        <Group>
          {editable && (
            <Button
              variant="default"
              leftSection={<IconEdit size={18} />}
              onClick={openEdit}
            >
              Editar
            </Button>
          )}
          {canApprove && (
            <Button onClick={() => run("approve", "Cotización aprobada.")}>Aprobar</Button>
          )}
          {canReject && (
            <Button variant="default" color="red" onClick={() => run("reject", "Rechazada.")}>
              Rechazar
            </Button>
          )}
          {canConvert && (
            <Button color="grape" onClick={doConvert} loading={convert.isPending}>
              Convertir en factura
            </Button>
          )}
        </Group>
      </Group>

      <Card withBorder radius="md">
        <Group gap="xl">
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Cliente
            </Text>
            <Text>{quote.customer_name}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Emisión
            </Text>
            <Text>{formatDate(quote.issue_date)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Vence
            </Text>
            <Text>{formatDate(quote.expiration_date)}</Text>
          </div>
        </Group>
      </Card>

      <Card withBorder radius="md">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Concepto</Table.Th>
              <Table.Th ta="right">Cant.</Table.Th>
              <Table.Th ta="right">Precio</Table.Th>
              <Table.Th ta="right">Total</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(quote.lines ?? []).map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.description || l.product_sku}</Table.Td>
                <Table.Td ta="right">{l.quantity}</Table.Td>
                <Table.Td ta="right">{formatCurrency(l.unit_price)}</Table.Td>
                <Table.Td ta="right">{formatCurrency(l.total)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="flex-end" mt="md">
          <Stack gap={2} w={260}>
            <Group justify="space-between">
              <Text c="dimmed">Subtotal</Text>
              <Text>{formatCurrency(quote.subtotal)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Descuento ({Number(quote.discount_percentage)}%)</Text>
              <Text>−{formatCurrency(quote.discount_amount)}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">Impuesto ({Number(quote.tax_percentage)}%)</Text>
              <Text>{formatCurrency(quote.tax_amount)}</Text>
            </Group>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatCurrency(quote.total)}</Text>
            </Group>
          </Stack>
        </Group>
      </Card>

      <QuoteCreateModal opened={editOpen} onClose={closeEdit} quote={quote} />
    </Stack>
  );
}
