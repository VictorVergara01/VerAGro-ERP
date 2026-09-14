import { Box, Group, NavLink as MantineNavLink, Stack, Text } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";

import { Logo } from "../ui/Logo";
import { NAV_GROUPS } from "./navItems";
import { useAuth } from "../../features/auth/useAuth";
import { canSeeNav } from "../../features/auth/roles";

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNav(user?.role, item.to)),
  })).filter((group) => group.items.length > 0);

  return (
    <Stack gap="lg" h="100%">
      <Group justify="center" pt={4} pb="xs">
        <Logo height={44} />
      </Group>

      <Stack gap="lg" style={{ flex: 1 }}>
        {groups.map((group) => (
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

      <Box>
        <Text c="dimmed" size="xs" ta="center">
          Veragro ERP · v2.0
        </Text>
      </Box>
    </Stack>
  );
}
