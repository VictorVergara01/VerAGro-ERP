import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { FormModal, Picker } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import { serviceTypeLabels } from "../../theme";
import { useCustomers } from "../customers/api";
import { useEquipmentList } from "../equipment/api";
import { NewOrderInput, useCreateOrder } from "./api";

const SERVICE_TYPES = Object.entries(serviceTypeLabels).map(([value, label]) => ({ value, label }));

export function ServiceOrderFormModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [customer, setCustomer] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [serviceType, setServiceType] = useState<string>("diagnostic");
  const [complaint, setComplaint] = useState("");
  const create = useCreateOrder();
  const customers = useCustomers("");
  const equipments = useEquipmentList("");

  useEffect(() => {
    if (visible) {
      setCustomer(null);
      setEquipment(null);
      setServiceType("diagnostic");
      setComplaint("");
    }
  }, [visible]);

  const submit = () => {
    if (!customer) return Alert.alert("Falta el cliente", "Selecciona un cliente.");
    const input: NewOrderInput = {
      customer,
      equipment,
      service_type: serviceType,
      customer_complaint: complaint,
    };
    create.mutate(input, {
      onSuccess: onClose,
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  // Filtra equipos por el cliente elegido (si lo trae el equipo).
  const equipmentOptions = (equipments.data ?? [])
    .filter((e) => !customer || e.customer === customer)
    .map((e) => ({ value: e.id, label: e.name }));

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Nueva orden"
      onSubmit={submit}
      submitting={create.isPending}
      submitLabel="Crear"
    >
      <Picker
        label="Cliente"
        value={customer}
        onChange={(v) => {
          setCustomer(v as number | null);
          setEquipment(null);
        }}
        options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Picker
        label="Equipo"
        value={equipment}
        onChange={(v) => setEquipment(v as number | null)}
        options={equipmentOptions}
        clearable
        placeholder="Sin equipo"
      />
      <Picker
        label="Tipo de servicio"
        value={serviceType}
        onChange={(v) => setServiceType(String(v))}
        options={SERVICE_TYPES}
      />
      <LabeledInput label="Reclamo del cliente" value={complaint} onChangeText={setComplaint} multiline />
    </FormModal>
  );
}
