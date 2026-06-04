import { Burger, Group, Menu, Avatar, Text, UnstyledButton } from "@mantine/core";
import { IconLogout, IconChevronDown } from "@tabler/icons-react";

import { useAuth } from "../../features/auth/useAuth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  technician: "Técnico",
  sales: "Ventas",
  inventory: "Inventario",
  readonly: "Solo lectura",
};

export function Topbar({
  opened,
  onToggle,
}: {
  opened: boolean;
  onToggle: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Burger opened={opened} onClick={onToggle} hiddenFrom="sm" size="sm" />
        <Text fw={700}>Veragro ERP</Text>
      </Group>
      <Menu shadow="md" width={220} position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Group gap="xs">
              <Avatar color="green" radius="xl" size={32}>
                {(user?.full_name ?? "?").slice(0, 1).toUpperCase()}
              </Avatar>
              <div style={{ lineHeight: 1.1 }}>
                <Text size="sm" fw={500}>
                  {user?.full_name ?? "Usuario"}
                </Text>
                <Text size="xs" c="dimmed">
                  {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
                </Text>
              </div>
              <IconChevronDown size={16} />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{user?.email}</Menu.Label>
          <Menu.Item
            color="red"
            leftSection={<IconLogout size={16} />}
            onClick={logout}
          >
            Cerrar sesión
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
