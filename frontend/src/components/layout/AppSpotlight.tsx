import { rem } from "@mantine/core";
import { Spotlight, type SpotlightActionData } from "@mantine/spotlight";
import { IconSearch } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

import { NAV_ITEMS } from "./navItems";

/** Command palette (Ctrl/⌘ + K) para saltar a cualquier sección. */
export function AppSpotlight() {
  const navigate = useNavigate();

  const actions: SpotlightActionData[] = NAV_ITEMS.map((item) => {
    const Icon = item.icon;
    return {
      id: item.to,
      label: item.label,
      leftSection: <Icon size={20} stroke={1.8} />,
      onClick: () => navigate(item.to),
    };
  });

  return (
    <Spotlight
      actions={actions}
      shortcut="mod + K"
      nothingFound="Sin resultados"
      highlightQuery
      searchProps={{
        leftSection: <IconSearch style={{ width: rem(18), height: rem(18) }} />,
        placeholder: "Buscar sección…",
      }}
    />
  );
}
