import { Text } from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";

interface ZoneProps {
  zoneKey: string;
  label: string;
  selectedKeys: Set<string>;
  onZoneSelect: (key: string) => void;
  children: ReactNode;
}

function Zone({ zoneKey, label, selectedKeys, onZoneSelect, children }: ZoneProps) {
  const selected = selectedKeys.has(zoneKey);
  const activate = () => onZoneSelect(zoneKey);
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-key={zoneKey}
      onClick={activate}
      onKeyDown={onKey}
      className={`veragro-zone${selected ? " is-selected" : ""}`}
      style={{ cursor: "pointer" }}
    >
      <title>{label}</title>
      {children}
    </g>
  );
}

const ZONE_CSS = `
.veragro-zone { outline: none; }
.veragro-zone .zone-fill {
  fill: var(--mantine-color-default);
  stroke: var(--mantine-color-dimmed);
  stroke-width: 1.5;
  transition: fill 120ms, stroke 120ms;
}
.veragro-zone:hover .zone-fill { fill: var(--mantine-primary-color-light); }
.veragro-zone.is-selected .zone-fill {
  fill: var(--mantine-primary-color-light);
  stroke: var(--mantine-primary-color-filled);
  stroke-width: 2.5;
}
.veragro-zone:focus-visible .zone-fill { stroke: var(--mantine-primary-color-filled); stroke-width: 2.5; }
.veragro-diagram text { fill: var(--mantine-color-dimmed); font-size: 11px; font-family: var(--mantine-font-family-monospace, monospace); }
@media (prefers-reduced-motion: reduce) { .veragro-zone .zone-fill { transition: none; } }
`;

function T50Diagram(props: Omit<ZoneProps, "zoneKey" | "label" | "children">) {
  // Vista superior: cuerpo central + 4 brazos en X, tanque, radar, tren.
  const arm = (key: string, label: string, x1: number, y1: number, x2: number, y2: number, cx: number, cy: number) => (
    <Zone zoneKey={key} label={label} {...props}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="zone-fill" />
      <circle cx={cx} cy={cy} r={26} className="zone-fill" />
      <circle cx={cx} cy={cy} r={11} className="zone-fill" />
      <text x={cx} y={cy - 34} textAnchor="middle">{key.toUpperCase()}</text>
    </Zone>
  );
  return (
    <svg viewBox="0 0 360 360" className="veragro-diagram" role="group" aria-label="Diagrama DJI Agras T50 (vista superior)" style={{ width: "100%", height: "auto" }}>
      <style>{ZONE_CSS}</style>
      {arm("arm_m1", "Brazo M1", 180, 180, 70, 70, 60, 60)}
      {arm("arm_m2", "Brazo M2", 180, 180, 290, 70, 300, 60)}
      {arm("arm_m3", "Brazo M3", 180, 180, 70, 290, 60, 300)}
      {arm("arm_m4", "Brazo M4", 180, 180, 290, 290, 300, 300)}
      <Zone zoneKey="structure" label="Estructura" {...props}>
        <rect x={135} y={135} width={90} height={90} rx={16} className="zone-fill" />
      </Zone>
      <Zone zoneKey="spray" label="Sistema de pulverización" {...props}>
        <rect x={152} y={150} width={56} height={40} rx={8} className="zone-fill" />
      </Zone>
      <Zone zoneKey="navigation" label="Navegación y seguridad" {...props}>
        <rect x={168} y={120} width={24} height={16} rx={4} className="zone-fill" />
      </Zone>
      <Zone zoneKey="spreading" label="Sistema de esparcimiento" {...props}>
        <rect x={160} y={196} width={40} height={22} rx={6} className="zone-fill" />
      </Zone>
    </svg>
  );
}

function D12500Diagram(props: Omit<ZoneProps, "zoneKey" | "label" | "children">) {
  // Vista frontal: bloque motor, tanque combustible, panel, refrigeración, chasis.
  const block = (key: string, label: string, x: number, y: number, w: number, h: number) => (
    <Zone zoneKey={key} label={label} {...props}>
      <rect x={x} y={y} width={w} height={h} rx={8} className="zone-fill" />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle">{key.toUpperCase()}</text>
    </Zone>
  );
  return (
    <svg viewBox="0 0 360 300" className="veragro-diagram" role="group" aria-label="Diagrama DJI D12500iE (vista frontal)" style={{ width: "100%", height: "auto" }}>
      <style>{ZONE_CSS}</style>
      <Zone zoneKey="structure" label="Estructura" {...props}>
        <rect x={20} y={20} width={320} height={260} rx={14} className="zone-fill" />
      </Zone>
      {block("engine", "Motor", 40, 60, 140, 120)}
      {block("cooling", "Refrigeración", 40, 190, 140, 60)}
      {block("fuel", "Sistema de combustible", 200, 60, 120, 70)}
      {block("electrical", "Sistema eléctrico", 200, 140, 120, 50)}
      {block("control_panel", "Panel de control", 200, 200, 120, 50)}
    </svg>
  );
}

export function EquipmentDiagram({
  modelCode,
  selectedKeys,
  onZoneSelect,
}: {
  modelCode: string | null | undefined;
  selectedKeys: Set<string>;
  onZoneSelect: (key: string) => void;
}) {
  const code = (modelCode ?? "").toUpperCase();
  const zoneProps = { selectedKeys, onZoneSelect };
  if (code === "T50") return <T50Diagram {...zoneProps} />;
  if (code === "D12500IE") return <D12500Diagram {...zoneProps} />;
  return (
    <Text c="dimmed" ta="center" py="xl">
      Sin diagrama para este modelo.
    </Text>
  );
}
