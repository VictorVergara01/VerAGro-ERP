import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import { formatCurrency } from "../../utils/format";
import { useRecordPayment } from "./api";
import { PAYMENT_METHOD_OPTIONS, type Invoice } from "./types";

export function PaymentModal({
  opened,
  onClose,
  invoice,
}: {
  opened: boolean;
  onClose: () => void;
  invoice: Invoice;
}) {
  const record = useRecordPayment(invoice.id);
  const [amount, setAmount] = useState<number | string>("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (opened) {
      setAmount(invoice.balance_due ?? "");
      setMethod("cash");
      setReference("");
      setNotes("");
    }
  }, [opened, invoice.balance_due]);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) {
      notifications.show({ color: "red", message: "Monto inválido." });
      return;
    }
    try {
      await record.mutateAsync({
        amount: String(amount),
        method,
        reference_number: reference,
        notes,
      });
      notifications.show({ color: "green", message: "Pago registrado." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Registrar pago" size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          Saldo pendiente: {formatCurrency(invoice.balance_due)}
        </Text>
        <NumberInput
          label="Monto"
          min={0}
          decimalScale={2}
          value={amount}
          onChange={(v) => setAmount(v as number | string)}
        />
        <Select
          label="Método"
          data={PAYMENT_METHOD_OPTIONS}
          allowDeselect={false}
          value={method}
          onChange={(v) => setMethod(v ?? "cash")}
        />
        <TextInput
          label="Referencia"
          value={reference}
          onChange={(e) => setReference(e.currentTarget.value)}
        />
        <Textarea
          label="Notas"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={record.isPending}>
            Registrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
