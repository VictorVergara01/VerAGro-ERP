import {
  ActionIcon,
  Avatar,
  Burger,
  Group,
  Menu,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";

import { useAuth } from "../../features/auth/useAuth";
import { Logo } from "../ui/Logo";

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const dark = computed === "dark";
  return (
    <ActionIcon
      variant="default"
      size="lg"
      radius="md"
      onClick={() => setColorScheme(dark ? "light" : "dark")}
      aria-label="Cambiar tema"
    >
      {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

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
        <Logo height={32} />
      </Group>
      <Group gap="sm">
        <ThemeToggle />
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
    </Group>
  );
}
