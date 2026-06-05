import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Menu,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconBrandWhatsapp,
  IconCash,
  IconChevronDown,
  IconDownload,
  IconEdit,
  IconPrinter,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import { useParams } from "react-router-dom";

import { DetailHeader } from "../../components/ui/DetailHeader";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  downloadInvoicePdf,
  printInvoicePdf,
  whatsappInvoiceUrl,
} from "./documents";
import { useInvoice, useInvoiceAction } from "./api";
import { InvoiceCreateModal } from "./InvoiceCreateModal";
import { PaymentModal } from "./PaymentModal";
import {
  INVOICE_STATUS_COLOR,
  INVOICE_STATUS_LABEL,
  INVOICE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
} from "./types";

export function InvoiceDetailPage() {
  const { id } = useParams();
  const invoiceId = id ? Number(id) : undefined;
  const { data: invoice, isLoading, error } = useInvoice(invoiceId);
  const action = useInvoiceAction(invoiceId);
  const [payOpen, { open, close }] = useDisclosure(false);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  if (isLoading) return <Loader />;
  if (error || !invoice)
    return <Alert color="red">No se pudo cargar la factura.</Alert>;

  const status = invoice.status ?? "draft";
  const canIssue = status === "draft";
  const canPay = status === "issued" || status === "partially_paid";
  const canCancel = status !== "paid" && status !== "cancelled";

  const run = async (a: "issue" | "cancel", ok: string) => {
    try {
      await action.mutateAsync(a);
      notifications.show({ color: "green", message: ok });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const confirmCancel = () =>
    modals.openConfirmModal({
      title: "Cancelar factura",
      children: "¿Cancelar esta factura?",
      labels: { confirm: "Cancelar factura", cancel: "Volver" },
      confirmProps: { color: "red" },
      onConfirm: () => run("cancel", "Factura cancelada."),
    });

  const handleDownload = async () => {
    try {
      await downloadInvoicePdf(invoice);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const handlePrint = async () => {
    try {
      await printInvoicePdf(invoice);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const handleWhatsapp = async () => {
    // Descarga el PDF primero (queda listo para adjuntar) y abre WhatsApp con el mensaje.
    try {
      await downloadInvoicePdf(invoice);
    } catch {
      // Si la descarga falla, igual abrimos WhatsApp con el mensaje.
    }
    window.open(whatsappInvoiceUrl(invoice), "_blank");
    notifications.show({
      color: "green",
      message: "PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió.",
    });
  };

  return (
    <Stack>
      <DetailHeader
        backTo="/invoices"
        backLabel="Facturas"
        title={invoice.invoice_number}
        badge={
          <Badge color={INVOICE_STATUS_COLOR[status]} variant="light" size="lg">
            {INVOICE_STATUS_LABEL[status]}
          </Badge>
        }
        actions={
          <>
          {canIssue && (
            <Button
              variant="default"
              leftSection={<IconEdit size={18} />}
              onClick={openEdit}
            >
              Editar
            </Button>
          )}
          {canIssue && (
            <Button leftSection={<IconSend size={18} />} onClick={() => run("issue", "Factura emitida.")}>
              Emitir
            </Button>
          )}
          {canPay && (
            <Button color="green" leftSection={<IconCash size={18} />} onClick={open}>
              Registrar pago
            </Button>
          )}
          {canCancel && (
            <Button variant="subtle" color="red" leftSection={<IconX size={18} />} onClick={confirmCancel}>
              Cancelar
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="light" rightSection={<IconChevronDown size={16} />}>
                Compartir
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconDownload size={16} />} onClick={handleDownload}>
                Descargar PDF
              </Menu.Item>
              <Menu.Item leftSection={<IconPrinter size={16} />} onClick={handlePrint}>
                Imprimir
              </Menu.Item>
              <Menu.Item
                leftSection={<IconBrandWhatsapp size={16} />}
                color="green"
                onClick={handleWhatsapp}
              >
                Enviar por WhatsApp
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          </>
        }
      />

      <Card>
        <Group gap="xl">
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Cliente
            </Text>
            <Text>{invoice.customer_name}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Tipo
            </Text>
            <Text>{INVOICE_TYPE_LABEL[invoice.invoice_type ?? "service_invoice"]}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Emisión
            </Text>
            <Text>{formatDate(invoice.issue_date)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Vence
            </Text>
            <Text>{formatDate(invoice.due_date)}</Text>
          </div>
        </Group>
      </Card>

      <Card>
        <Text fw={600} mb="sm">
          Conceptos
        </Text>
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
            {(invoice.lines ?? []).map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.description || l.product_sku}</Table.Td>
                <Table.Td ta="right">{l.quantity}</Table.Td>
                <Table.Td ta="right">{formatCurrency(l.unit_price)}</Table.Td>
                <Table.Td ta="right">{formatCurrency(l.total)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Grid>
        <Grid.Col span={{ base: 12, sm: 7 }}>
          <Card>
            <Text fw={600} mb="sm">
              Pagos
            </Text>
            {(invoice.payments ?? []).length === 0 ? (
              <Text c="dimmed" size="sm">
                Sin pagos registrados.
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Método</Table.Th>
                    <Table.Th>Ref.</Table.Th>
                    <Table.Th ta="right">Monto</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(invoice.payments ?? []).map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>{formatDate(p.payment_date)}</Table.Td>
                      <Table.Td>{PAYMENT_METHOD_LABEL[p.method ?? "cash"]}</Table.Td>
                      <Table.Td>{p.reference_number || "—"}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(p.amount)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <Card>
            <Stack gap={4}>
              <Group justify="space-between">
                <Text c="dimmed">Subtotal</Text>
                <Text>{formatCurrency(invoice.subtotal)}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Descuento ({Number(invoice.discount_percentage)}%)</Text>
                <Text>−{formatCurrency(invoice.discount_amount)}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Impuesto ({Number(invoice.tax_percentage)}%)</Text>
                <Text>{formatCurrency(invoice.tax_amount)}</Text>
              </Group>
              <Group justify="space-between">
                <Text fw={700}>Total</Text>
                <Text fw={700}>{formatCurrency(invoice.total)}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Pagado</Text>
                <Text c="green">{formatCurrency(invoice.paid_amount)}</Text>
              </Group>
              <Group justify="space-between">
                <Text fw={700}>Saldo</Text>
                <Text fw={700}>{formatCurrency(invoice.balance_due)}</Text>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <PaymentModal opened={payOpen} onClose={close} invoice={invoice} />
      <InvoiceCreateModal opened={editOpen} onClose={closeEdit} invoice={invoice} />
    </Stack>
  );
}
