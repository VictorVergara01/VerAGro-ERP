import {
  Alert,
  Anchor,
  Badge,
  Card,
  Grid,
  Loader,
  Stack,
  Tabs,
} from "@mantine/core";
import { useParams } from "react-router-dom";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { DetailHeader } from "../../components/ui/DetailHeader";
import { Field } from "../../components/ui/Field";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  useCustomer,
  useCustomerInvoices,
  useCustomerServiceOrders,
  type InvoiceSummary,
  type ServiceOrderSummary,
} from "./api";
import { CUSTOMER_TYPE_LABEL } from "./types";

const orderColumns: Column<ServiceOrderSummary>[] = [
  { header: "N.º", render: (o) => o.service_order_number },
  { header: "Tipo", render: (o) => o.service_type },
  { header: "Estado", render: (o) => <Badge variant="light">{o.status}</Badge> },
  { header: "Recibida", render: (o) => formatDate(o.received_date) },
  { header: "Total", align: "right", render: (o) => formatCurrency(o.total_amount) },
];

const invoiceColumns: Column<InvoiceSummary>[] = [
  { header: "N.º", render: (i) => i.invoice_number },
  { header: "Tipo", render: (i) => i.invoice_type },
  { header: "Estado", render: (i) => <Badge variant="light">{i.status}</Badge> },
  { header: "Emisión", render: (i) => formatDate(i.issue_date) },
  { header: "Total", align: "right", render: (i) => formatCurrency(i.total) },
  { header: "Saldo", align: "right", render: (i) => formatCurrency(i.balance_due) },
];

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = id ? Number(id) : undefined;
  const { data: customer, isLoading, error } = useCustomer(customerId);
  const orders = useCustomerServiceOrders(customerId);
  const invoices = useCustomerInvoices(customerId);

  if (isLoading) return <Loader />;
  if (error || !customer)
    return <Alert color="red">No se pudo cargar el cliente.</Alert>;

  return (
    <Stack>
      <DetailHeader
        backTo="/customers"
        backLabel="Clientes"
        title={customer.name}
        badge={
          <Badge color={customer.is_active ? "green" : "gray"} variant="light">
            {customer.is_active ? "Activo" : "Inactivo"}
          </Badge>
        }
      />

      <Card>
        <Grid>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field
              label="Tipo"
              value={CUSTOMER_TYPE_LABEL[customer.customer_type ?? "person"]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Razón social" value={customer.legal_name} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Identificación" value={customer.identification_number} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Teléfono" value={customer.phone} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field
              label="Correo"
              value={
                customer.email ? (
                  <Anchor href={`mailto:${customer.email}`}>{customer.email}</Anchor>
                ) : null
              }
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Provincia" value={customer.province} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Distrito" value={customer.district} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Field label="Dirección" value={customer.address} />
          </Grid.Col>
        </Grid>
      </Card>

      <Tabs defaultValue="orders">
        <Tabs.List>
          <Tabs.Tab value="orders">Órdenes de servicio</Tabs.Tab>
          <Tabs.Tab value="invoices">Facturas</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="orders" pt="md">
          <DataTable
            columns={orderColumns}
            rows={orders.data ?? []}
            loading={orders.isLoading}
            rowKey={(o) => o.id}
            emptyText="Sin órdenes de servicio."
          />
        </Tabs.Panel>
        <Tabs.Panel value="invoices" pt="md">
          <DataTable
            columns={invoiceColumns}
            rows={invoices.data ?? []}
            loading={invoices.isLoading}
            rowKey={(i) => i.id}
            emptyText="Sin facturas."
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
