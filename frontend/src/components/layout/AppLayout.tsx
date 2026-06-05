import { AppShell, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Outlet } from "react-router-dom";

import { AppSpotlight } from "./AppSpotlight";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: 280,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="lg"
    >
      <AppShell.Header>
        <Topbar opened={opened} onToggle={toggle} />
      </AppShell.Header>
      <AppShell.Navbar p="md" component={ScrollArea}>
        <Sidebar onNavigate={close} />
      </AppShell.Navbar>
      <AppShell.Main bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
        <AppSpotlight />
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
