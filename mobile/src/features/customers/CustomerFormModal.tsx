import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { FormModal, Segmented } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import { CustomerInput, useSaveCustomer, type Customer } from "./api";

const EMPTY: CustomerInput = {
  name: "",
  customer_type: "person",
  legal_name: "",
  identification_number: "",
  phone: "",
  whatsapp: "",
  email: "",
  province: "",
  district: "",
  address: "",
};

export function CustomerFormModal({
  visible,
  onClose,
  customer,
}: {
  visible: boolean;
  onClose: () => void;
  customer?: Customer | null;
}) {
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const save = useSaveCustomer();

  useEffect(() => {
    if (visible) {
      setForm(
        customer
          ? {
              name: customer.name ?? "",
              customer_type: customer.customer_type ?? "person",
              legal_name: customer.legal_name ?? "",
              identification_number: customer.identification_number ?? "",
              phone: customer.phone ?? "",
              whatsapp: customer.whatsapp ?? "",
              email: customer.email ?? "",
              province: customer.province ?? "",
              district: customer.district ?? "",
              address: customer.address ?? "",
            }
          : EMPTY,
      );
    }
  }, [visible, customer]);

  const set = (k: keyof CustomerInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      Alert.alert("Falta el nombre", "El nombre es obligatorio.");
      return;
    }
    save.mutate(
      { id: customer?.id, input: form },
      {
        onSuccess: onClose,
        onError: (e) => Alert.alert("Error", (e as Error).message),
      },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={customer ? "Editar cliente" : "Nuevo cliente"}
      onSubmit={submit}
      submitting={save.isPending}
    >
      <Segmented
        label="Tipo"
        value={form.customer_type}
        onChange={(v) => setForm((f) => ({ ...f, customer_type: v }))}
        options={[
          { value: "person", label: "Persona" },
          { value: "company", label: "Empresa" },
        ]}
      />
      <LabeledInput label="Nombre" value={form.name} onChangeText={set("name")} />
      <LabeledInput label="Razón social" value={form.legal_name} onChangeText={set("legal_name")} />
      <LabeledInput
        label="Identificación / RUC"
        value={form.identification_number}
        onChangeText={set("identification_number")}
      />
      <LabeledInput label="Teléfono" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
      <LabeledInput label="WhatsApp" value={form.whatsapp} onChangeText={set("whatsapp")} keyboardType="phone-pad" />
      <LabeledInput label="Correo" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
      <LabeledInput label="Provincia" value={form.province} onChangeText={set("province")} />
      <LabeledInput label="Distrito" value={form.district} onChangeText={set("district")} />
      <LabeledInput label="Dirección" value={form.address} onChangeText={set("address")} multiline />
    </FormModal>
  );
}
