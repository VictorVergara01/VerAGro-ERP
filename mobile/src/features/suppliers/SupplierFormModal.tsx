import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { FormModal } from "../../components/ui/form";
import { LabeledInput } from "../../components/ui";
import { SupplierInput, useSaveSupplier, type Supplier } from "./api";

const EMPTY: SupplierInput = {
  name: "",
  legal_name: "",
  contact_person: "",
  country: "",
  phone: "",
  email: "",
  payment_terms: "",
};

export function SupplierFormModal({
  visible,
  onClose,
  supplier,
}: {
  visible: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}) {
  const [form, setForm] = useState<SupplierInput>(EMPTY);
  const save = useSaveSupplier();

  useEffect(() => {
    if (visible) {
      setForm(
        supplier
          ? {
              name: supplier.name ?? "",
              legal_name: supplier.legal_name ?? "",
              contact_person: supplier.contact_person ?? "",
              country: supplier.country ?? "",
              phone: supplier.phone ?? "",
              email: supplier.email ?? "",
              payment_terms: supplier.payment_terms ?? "",
            }
          : EMPTY,
      );
    }
  }, [visible, supplier]);

  const set = (k: keyof SupplierInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      Alert.alert("Falta el nombre", "El nombre es obligatorio.");
      return;
    }
    save.mutate(
      { id: supplier?.id, input: form },
      { onSuccess: onClose, onError: (e) => Alert.alert("Error", (e as Error).message) },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={supplier ? "Editar proveedor" : "Nuevo proveedor"}
      onSubmit={submit}
      submitting={save.isPending}
    >
      <LabeledInput label="Nombre" value={form.name} onChangeText={set("name")} />
      <LabeledInput label="Razón social" value={form.legal_name} onChangeText={set("legal_name")} />
      <LabeledInput label="Contacto" value={form.contact_person} onChangeText={set("contact_person")} />
      <LabeledInput label="País" value={form.country} onChangeText={set("country")} />
      <LabeledInput label="Teléfono" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
      <LabeledInput label="Correo" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
      <LabeledInput label="Términos de pago" value={form.payment_terms} onChangeText={set("payment_terms")} />
    </FormModal>
  );
}
