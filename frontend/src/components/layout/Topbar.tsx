import {
  ActionIcon,
  Avatar,
  Burger,
  Group,
  Indicator,
  Kbd,
  Menu,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { spotlight } from "@mantine/spotlight";
import {
  IconBell,
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSun,
} from "@tabler/icons-react";

import { ROLE_LABELS } from "../../features/auth/roles";
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

function SearchTrigger() {
  return (
    <UnstyledButton
      onClick={spotlight.open}
      visibleFrom="sm"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: 280,
        padding: "7px 12px",
        borderRadius: "var(--mantine-radius-md)",
        border: "1px solid var(--mantine-color-default-border)",
        color: "var(--mantine-color-dimmed)",
        background: "var(--mantine-color-body)",
      }}
    >
      <IconSearch size={16} />
      <Text size="sm" c="dimmed" style={{ flex: 1 }}>
        Buscar…
      </Text>
      <Kbd size="xs">Ctrl K</Kbd>
    </UnstyledButton>
  );
}

export function Topbar({
  opened,
  onToggle,
}: {
  opened: boolean;
  onToggle: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group wrap="nowrap">
        <Burger opened={opened} onClick={onToggle} hiddenFrom="sm" size="sm" />
        <Logo height={30} />
        <SearchTrigger />
      </Group>

      <Group gap="sm" wrap="nowrap">
        <ActionIcon
          variant="default"
          size="lg"
          radius="md"
          onClick={spotlight.open}
          hiddenFrom="sm"
          aria-label="Buscar"
        >
          <IconSearch size={18} />
        </ActionIcon>
        <Indicator color="green" size={8} offset={6}>
          <ActionIcon variant="default" size="lg" radius="md" aria-label="Notificaciones">
            <IconBell size={18} />
          </ActionIcon>
        </Indicator>
        <ThemeToggle />
        <Menu shadow="md" width={220} position="bottom-end">
          <Menu.Target>
            <UnstyledButton>
              <Group gap="xs" wrap="nowrap">
                <Avatar color="green" radius="xl" size={34}>
                  {(user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </Avatar>
                <div style={{ lineHeight: 1.1 }} className="user-meta">
                  <Text size="sm" fw={600} visibleFrom="sm">
                    {user?.full_name ?? "Usuario"}
                  </Text>
                  <Text size="xs" c="dimmed" visibleFrom="sm">
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
