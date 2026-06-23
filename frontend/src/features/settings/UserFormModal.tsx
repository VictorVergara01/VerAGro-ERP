import { Button, Group, Modal, PasswordInput, Select, Stack, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect } from "react";

import { ROLE_LABELS, isSuperAdmin } from "../auth/roles";
import type { UserAccount, UserInput } from "./api";

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export interface UserFormModalProps {
  opened: boolean;
  onClose: () => void;
  editing: UserAccount | null;
  currentRole?: string;
  submitting: boolean;
  onSubmit: (input: UserInput) => void;
}

export function UserFormModal({
  opened,
  onClose,
  editing,
  currentRole,
  submitting,
  onSubmit,
}: UserFormModalProps) {
  const isEdit = editing != null;
  const roleOptions = isSuperAdmin(currentRole)
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((o) => o.value !== "super_admin");

  const form = useForm<{
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    password: string;
  }>({
    initialValues: { email: "", full_name: "", role: "technician", is_active: true, password: "" },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Email inválido"),
      password: (v) => (!isEdit && !v ? "La contraseña es obligatoria" : null),
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues(
        editing
          ? {
              email: editing.email,
              full_name: editing.full_name ?? "",
              role: editing.role,
              is_active: editing.is_active,
              password: "",
            }
          : { email: "", full_name: "", role: "technician", is_active: true, password: "" },
      );
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing]);

  const submit = form.onSubmit((values) => {
    onSubmit({
      id: editing?.id,
      email: values.email.trim(),
      full_name: values.full_name.trim(),
      role: values.role,
      is_active: values.is_active,
      password: values.password || undefined,
    });
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? "Editar usuario" : "Nuevo usuario"}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Email" withAsterisk {...form.getInputProps("email")} />
          <TextInput label="Nombre completo" {...form.getInputProps("full_name")} />
          <Select label="Rol" data={roleOptions} allowDeselect={false} {...form.getInputProps("role")} />
          <PasswordInput
            label="Contraseña"
            withAsterisk={!isEdit}
            placeholder={isEdit ? "Dejar vacío para no cambiar" : undefined}
            {...form.getInputProps("password")}
          />
          <Switch
            label="Activo"
            checked={form.values.is_active}
            onChange={(e) => form.setFieldValue("is_active", e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
