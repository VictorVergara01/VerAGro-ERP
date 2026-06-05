import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import { Screen } from "../../components/ui/Screen";
import { Button, ErrorState, LabeledInput, Loading, SectionTitle } from "../../components/ui";
import { colors } from "../../theme";
import { useAuth } from "../auth/useAuth";

interface Company {
  name: string;
  legal_name?: string;
  tax_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  invoice_footer?: string;
}

function useCompany() {
  return useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/company/");
      if (error || !data) throw new Error("No se pudo cargar la empresa.");
      return data as unknown as Company;
    },
  });
}

function useSaveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Company) => {
      const { error } = await api.PATCH("/api/company/", { body: input as never });
      if (error) throw new Error("No se pudo guardar (¿eres admin?).");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["company"] }),
  });
}

export function SettingsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, isLoading, error } = useCompany();
  const save = useSaveCompany();
  const [form, setForm] = useState<Company>({ name: "" });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        legal_name: data.legal_name ?? "",
        tax_id: data.tax_id ?? "",
        address: data.address ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        whatsapp: data.whatsapp ?? "",
        invoice_footer: data.invoice_footer ?? "",
      });
    }
  }, [data]);

  if (isLoading) return <Loading />;
  if (error) return <Screen><ErrorState text="No se pudo cargar la empresa." /></Screen>;

  const set = (k: keyof Company) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return Alert.alert("Falta el nombre", "El nombre es obligatorio.");
    save.mutate(form, {
      onSuccess: () => Alert.alert("Guardado", "Datos de empresa actualizados."),
      onError: (e) => Alert.alert("Error", (e as Error).message),
    });
  };

  return (
    <Screen scroll>
      <SectionTitle>Datos de empresa</SectionTitle>
      <LabeledInput label="Nombre comercial" value={form.name} onChangeText={set("name")} editable={isAdmin} />
      <LabeledInput label="Razón social" value={form.legal_name} onChangeText={set("legal_name")} editable={isAdmin} />
      <LabeledInput label="RUC" value={form.tax_id} onChangeText={set("tax_id")} editable={isAdmin} />
      <LabeledInput label="Teléfono" value={form.phone} onChangeText={set("phone")} editable={isAdmin} keyboardType="phone-pad" />
      <LabeledInput label="WhatsApp" value={form.whatsapp} onChangeText={set("whatsapp")} editable={isAdmin} keyboardType="phone-pad" />
      <LabeledInput label="Correo" value={form.email} onChangeText={set("email")} editable={isAdmin} autoCapitalize="none" />
      <LabeledInput label="Dirección" value={form.address} onChangeText={set("address")} editable={isAdmin} multiline />
      <LabeledInput label="Pie de factura" value={form.invoice_footer} onChangeText={set("invoice_footer")} editable={isAdmin} multiline />
      {isAdmin && (
        <Button title="Guardar" icon="save" onPress={submit} loading={save.isPending} style={{ marginTop: 8 }} />
      )}
    </Screen>
  );
}
