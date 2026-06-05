import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { FormModal, Picker, Segmented } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import { useCustomers } from "../customers/api";
import {
  EquipmentInput,
  useEquipmentTypes,
  useSaveEquipment,
  type Equipment,
} from "./api";

const EMPTY: EquipmentInput = {
  name: "",
  equipment_type: null,
  customer: null,
  owner_type: "customer",
  status: "active",
  brand: "",
  model: "",
  serial_number: "",
  internal_code: "",
  notes: "",
};

export function EquipmentFormModal({
  visible,
  onClose,
  equipment,
}: {
  visible: boolean;
  onClose: () => void;
  equipment?: Equipment | null;
}) {
  const [form, setForm] = useState<EquipmentInput>(EMPTY);
  const save = useSaveEquipment();
  const types = useEquipmentTypes();
  const customers = useCustomers("");

  useEffect(() => {
    if (visible) {
      setForm(
        equipment
          ? {
              name: equipment.name ?? "",
              equipment_type: equipment.equipment_type ?? null,
              customer: equipment.customer ?? null,
              owner_type: equipment.owner_type ?? "customer",
              status: equipment.status ?? "active",
              brand: equipment.brand ?? "",
              model: equipment.model ?? "",
              serial_number: equipment.serial_number ?? "",
              internal_code: equipment.internal_code ?? "",
              notes: equipment.notes ?? "",
            }
          : EMPTY,
      );
    }
  }, [visible, equipment]);

  const set = (k: keyof EquipmentInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return Alert.alert("Falta el nombre", "El nombre es obligatorio.");
    if (!form.equipment_type) return Alert.alert("Falta el tipo", "Selecciona el tipo de equipo.");
    save.mutate(
      { id: equipment?.id, input: form },
      { onSuccess: onClose, onError: (e) => Alert.alert("Error", (e as Error).message) },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={equipment ? "Editar equipo" : "Nuevo equipo"}
      onSubmit={submit}
      submitting={save.isPending}
    >
      <LabeledInput label="Nombre" value={form.name} onChangeText={set("name")} />
      <Picker
        label="Tipo de equipo"
        value={form.equipment_type}
        onChange={(v) => setForm((f) => ({ ...f, equipment_type: v as number | null }))}
        options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
      />
      <Picker
        label="Cliente"
        value={form.customer}
        onChange={(v) => setForm((f) => ({ ...f, customer: v as number | null }))}
        options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        clearable
        placeholder="Equipo de la empresa"
      />
      <Segmented
        label="Estado"
        value={form.status}
        onChange={(v) => setForm((f) => ({ ...f, status: v }))}
        options={[
          { value: "active", label: "Activo" },
          { value: "in_repair", label: "En reparación" },
          { value: "retired", label: "Retirado" },
        ]}
      />
      <LabeledInput label="Marca" value={form.brand} onChangeText={set("brand")} />
      <LabeledInput label="Modelo" value={form.model} onChangeText={set("model")} />
      <LabeledInput label="N.º de serie" value={form.serial_number} onChangeText={set("serial_number")} />
      <LabeledInput label="Código interno" value={form.internal_code} onChangeText={set("internal_code")} />
      <LabeledInput label="Notas" value={form.notes} onChangeText={set("notes")} multiline />
    </FormModal>
  );
}
