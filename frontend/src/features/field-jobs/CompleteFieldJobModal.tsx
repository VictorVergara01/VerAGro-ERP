import { Alert, Button, Group, Modal, NumberInput, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { formatCurrency } from "../../utils/format";
import { useCompleteFieldJob } from "./api";
import type { FieldJob } from "./types";

export function CompleteFieldJobModal({ job, onClose }: { job: FieldJob; onClose: () => void }) {
  const complete = useCompleteFieldJob(job.id);
  const solids = job.job_type === "spreading";
  const byQuintal = job.billing_unit === "qq";
  const form = useForm({
    initialValues: { actual_hectares: "" as number | string, applied_quintals: "" as number | string, done_date: "", due_date: "" },
    validate: {
      actual_hectares: (v) => Number(v) > 0 ? null : "Indica las hectáreas realmente trabajadas.",
      applied_quintals: (v) => (byQuintal || v !== "") && !(Number(v) > 0) ? "Indica los qq realmente aplicados." : null,
    },
  });
  const area = Number(form.values.actual_hectares) || 0;
  const qq = Number(form.values.applied_quintals) || 0;
  const quantity = Number((byQuintal ? qq : area).toFixed(2));
  const price = Number(job.unit_price) || 0;
  const submit = form.onSubmit(async (values) => {
    try {
      await complete.mutateAsync({
        actual_hectares: String(values.actual_hectares),
        applied_quintals: solids && values.applied_quintals !== "" ? String(values.applied_quintals) : null,
        done_date: values.done_date || undefined,
        due_date: values.due_date || undefined,
      });
      notifications.show({ color: "green", message: "Trabajo realizado registrado. Ya puedes registrar sus cobros y generar la factura cuando la necesites." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });
  return <Modal opened onClose={onClose} title="Registrar trabajo realizado">
    <form onSubmit={submit}><Stack>
      <Alert color="blue">Programado: {job.hectares} ha{solids && ` · ${job.estimated_quintals ?? job.total_quintals ?? "0"} qq previstos`}. Registra lo realizado; estas cantidades se usarán en la factura.</Alert>
      <NumberInput label="Hectáreas realmente trabajadas" required min={0} decimalScale={4} {...form.getInputProps("actual_hectares")} />
      {solids && <NumberInput label="Quintales realmente aplicados (qq)" required={byQuintal} description="Escribe la cantidad total aplicada, sin multiplicarla por hectáreas." min={0} decimalScale={2} {...form.getInputProps("applied_quintals")} />}
      {solids && area > 0 && qq > 0 && <Text size="sm">Dosis real: {Number((qq / area).toFixed(4))} qq/ha.</Text>}
      <TextInput label="Fecha realizada (opcional)" description="Si la dejas vacía se registra la fecha de hoy." type="date" {...form.getInputProps("done_date")} />
      <TextInput label="Fecha de vencimiento (opcional)" description="Si la dejas vacía, el plazo inicial es de 10 días desde la realización. Puedes cambiarlo después en Cobros." type="date" {...form.getInputProps("due_date")} />
      <Text fw={600}>A cobrar: {quantity} {byQuintal ? "qq" : "ha"} × {formatCurrency(price)} = {formatCurrency(quantity * price)}</Text>
      <Group justify="flex-end"><Button variant="default" onClick={onClose}>Volver</Button><Button type="submit" loading={complete.isPending}>Confirmar trabajo realizado</Button></Group>
    </Stack></form>
  </Modal>;
}
