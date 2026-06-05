import {
  Box,
  Card,
  Group,
  NavLink as MantineNavLink,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconDeviceMobile } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";

import { Logo } from "../ui/Logo";
import { NAV_GROUPS } from "./navItems";

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();

  return (
    <Stack gap="lg" h="100%">
      <Group justify="center" pt={4} pb="xs">
        <Logo height={44} />
      </Group>

      <Stack gap="lg" style={{ flex: 1 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <Text
              size="xs"
              c="dimmed"
              fw={700}
              tt="uppercase"
              mb={6}
              px="xs"
              style={{ letterSpacing: "0.05em" }}
            >
              {group.title}
            </Text>
            <Stack gap={2}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.to);
                return (
                  <MantineNavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={item.label}
                    active={active}
                    variant="light"
                    leftSection={<Icon size={20} stroke={1.8} />}
                    onClick={onNavigate}
                    styles={{
                      root: { borderRadius: "var(--mantine-radius-md)" },
                      label: { fontWeight: active ? 600 : 500 },
                    }}
                  />
                );
              })}
            </Stack>
          </div>
        ))}
      </Stack>

      <Card
        radius="lg"
        p="md"
        withBorder={false}
        style={{
          background:
            "linear-gradient(135deg, var(--mantine-color-green-8), var(--mantine-color-green-6))",
          color: "white",
        }}
      >
        <ThemeIcon variant="white" color="green" radius="md" size={36} mb="xs">
          <IconDeviceMobile size={20} />
        </ThemeIcon>
        <Text fw={700} size="sm">
          App de campo
        </Text>
        <Text size="xs" opacity={0.9} mt={2}>
          Los técnicos gestionan sus órdenes desde el móvil.
        </Text>
      </Card>

      <Box>
        <Text c="dimmed" size="xs" ta="center">
          Veragro ERP · v0.1
        </Text>
      </Box>
    </Stack>
  );
}
