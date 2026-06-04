import {
  Alert,
  Button,
  FileInput,
  Group,
  Image,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconUpload } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useAuth } from "../auth/useAuth";
import { useCompany, useSaveCompany, type CompanyInput } from "./api";

export function CompanySettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, isLoading, error } = useCompany();
  const save = useSaveCompany();
  const [logo, setLogo] = useState<File | null>(null);

  const form = useForm<Omit<CompanyInput, "logo">>({
    initialValues: {
      name: "",
      legal_name: "",
      tax_id: "",
      address: "",
      phone: "",
      email: "",
      whatsapp: "",
      invoice_footer: "",
    },
    validate: {
      name: (v) => (v.trim() ? null : "El nombre es obligatorio."),
    },
  });

  // Cargar valores una vez que llegan del backend.
  useEffect(() => {
    if (data) {
      form.setValues({
        name: data.name ?? "",
        legal_name: data.legal_name ?? "",
        tax_id: data.tax_id ?? "",
        address: data.address ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        whatsapp: data.whatsapp ?? "",
        invoice_footer: data.invoice_footer ?? "",
      });
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isLoading) return <Loader />;
  if (error) return <Alert color="red">No se pudo cargar la empresa.</Alert>;

  const submit = form.onSubmit(async (values) => {
    try {
      await save.mutateAsync({ ...values, logo });
      setLogo(null);
      notifications.show({ color: "green", message: "Datos de empresa guardados." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <form onSubmit={submit}>
      <Stack maw={720}>
        {!isAdmin && (
          <Alert color="yellow">
            Solo un administrador puede editar estos datos. Los ves en modo lectura.
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Estos datos aparecen en el encabezado y pie del PDF de las facturas.
        </Text>

        {data?.logo && (
          <Group>
            <Image src={data.logo} alt="Logo" h={60} w="auto" fit="contain" />
            <Text size="xs" c="dimmed">
              Logo actual
            </Text>
          </Group>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Nombre comercial"
            withAsterisk
            disabled={!isAdmin}
            {...form.getInputProps("name")}
          />
          <TextInput
            label="Razón social"
            disabled={!isAdmin}
            {...form.getInputProps("legal_name")}
          />
          <TextInput label="RUC" disabled={!isAdmin} {...form.getInputProps("tax_id")} />
          <TextInput label="Teléfono" disabled={!isAdmin} {...form.getInputProps("phone")} />
          <TextInput label="Email" disabled={!isAdmin} {...form.getInputProps("email")} />
          <TextInput
            label="WhatsApp"
            disabled={!isAdmin}
            {...form.getInputProps("whatsapp")}
          />
        </SimpleGrid>

        <Textarea
          label="Dirección"
          autosize
          minRows={2}
          disabled={!isAdmin}
          {...form.getInputProps("address")}
        />
        <Textarea
          label="Pie de factura (términos, datos de pago, Yappy…)"
          autosize
          minRows={2}
          disabled={!isAdmin}
          {...form.getInputProps("invoice_footer")}
        />
        <FileInput
          label="Logo (PNG/JPG)"
          placeholder="Seleccionar imagen…"
          accept="image/png,image/jpeg"
          leftSection={<IconUpload size={16} />}
          value={logo}
          onChange={setLogo}
          disabled={!isAdmin}
          clearable
        />

        {isAdmin && (
          <Group justify="flex-end">
            <Button type="submit" loading={save.isPending}>
              Guardar
            </Button>
          </Group>
        )}
      </Stack>
    </form>
  );
}
