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
  // Vista superior esquemática: protector frontal, dos grupos de brazos con hélices,
  // cuerpo central en tres bandas (frontal/intermedio/trasero), tanque, sistema
  // centrífugo, módulo de distribución, cableado y tren de aterrizaje.
  //
  // Grupo de brazos izquierdo (M1-M2, arriba-izq. y abajo-izq.) y derecho (M3-M4,
  // arriba-der. y abajo-der.); las hélices son anillos propios en cada punta.
  const armLine = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} className="zone-fill" />
  );
  const motor = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={14} className="zone-fill" />;
  const propeller = (cx: number, cy: number) => (
    <>
      <circle cx={cx} cy={cy} r={24} className="zone-fill" fillOpacity={0.35} />
      <circle cx={cx} cy={cy} r={9} className="zone-fill" />
    </>
  );

  return (
    <svg
      viewBox="0 0 380 380"
      className="veragro-diagram"
      role="group"
      aria-label="Diagrama DJI Agras T50 (vista superior)"
      style={{ width: "100%", height: "auto" }}
    >
      <style>{ZONE_CSS}</style>

      {/* Protector frontal */}
      <Zone zoneKey="protector_frontal" label="Protector frontal" {...props}>
        <path d="M 140 30 Q 190 8 240 30 L 232 62 Q 190 48 148 62 Z" className="zone-fill" />
        <text x={190} y={44} textAnchor="middle">PROTECTOR</text>
      </Zone>

      {/* Brazos M1-M2 (izquierda: arriba-izq. y abajo-izq.) */}
      <Zone zoneKey="brazos_m1_m2" label="Brazos M1-M2" {...props}>
        {armLine(190, 190, 70, 90)}
        {armLine(190, 190, 70, 290)}
        {motor(70, 90)}
        {motor(70, 290)}
        <rect x={40} y={170} width={40} height={40} rx={8} className="zone-fill" />
        <text x={60} y={195} textAnchor="middle">M1-M2</text>
      </Zone>

      {/* Brazos M3-M4 (derecha: arriba-der. y abajo-der.) */}
      <Zone zoneKey="brazos_m3_m4" label="Brazos M3-M4" {...props}>
        {armLine(190, 190, 310, 90)}
        {armLine(190, 190, 310, 290)}
        {motor(310, 90)}
        {motor(310, 290)}
        <rect x={300} y={170} width={40} height={40} rx={8} className="zone-fill" />
        <text x={320} y={195} textAnchor="middle">M3-M4</text>
      </Zone>

      {/* Hélices: anillos en las cuatro puntas de los brazos */}
      <Zone zoneKey="helices" label="Hélices" {...props}>
        {propeller(70, 90)}
        {propeller(70, 290)}
        {propeller(310, 90)}
        {propeller(310, 290)}
        <text x={190} y={355} textAnchor="middle">HELICES</text>
      </Zone>

      {/* Cuerpo central: tres bandas de chasis */}
      <Zone zoneKey="chasis_frontal" label="Chasis frontal" {...props}>
        <rect x={150} y={95} width={80} height={40} rx={8} className="zone-fill" />
        <text x={190} y={119} textAnchor="middle">CH.FRONT</text>
      </Zone>

      <Zone zoneKey="chasis_intermedio" label="Chasis intermedio" {...props}>
        <rect x={140} y={135} width={100} height={110} rx={8} className="zone-fill" />
      </Zone>

      <Zone zoneKey="chasis_trasero" label="Chasis trasero" {...props}>
        <rect x={150} y={245} width={80} height={40} rx={8} className="zone-fill" />
        <text x={190} y={269} textAnchor="middle">CH.TRAS</text>
      </Zone>

      {/* Tanque de fumigación: rect grande central sobre el chasis intermedio */}
      <Zone zoneKey="tanque_fumigacion" label="Tanque de fumigación" {...props}>
        <rect x={155} y={150} width={70} height={60} rx={10} className="zone-fill" />
        <text x={190} y={184} textAnchor="middle">TANQUE</text>
      </Zone>

      {/* Sistema centrífugo: bajo el tanque */}
      <Zone zoneKey="sistema_centrifugo" label="Sistema centrífugo" {...props}>
        <rect x={165} y={214} width={50} height={26} rx={6} className="zone-fill" />
        <text x={190} y={231} textAnchor="middle">CENTRIF.</text>
      </Zone>

      {/* Módulo de distribución: pequeño rect en el cuerpo, junto al chasis frontal */}
      <Zone zoneKey="modulo_distribucion" label="Módulo de distribución" {...props}>
        <rect x={200} y={100} width={26} height={20} rx={4} className="zone-fill" />
      </Zone>

      {/* Cableado de chasis: banda fina cruzando el cuerpo */}
      <Zone zoneKey="cableado_chasis" label="Cableado de chasis" {...props}>
        <rect x={140} y={142} width={100} height={10} className="zone-fill" />
      </Zone>

      {/* Tren de aterrizaje: dos patas bajo el cuerpo */}
      <Zone zoneKey="tren_aterrizaje" label="Tren de aterrizaje" {...props}>
        <path d="M 155 285 L 145 340 Q 165 350 175 340 L 168 285 Z" className="zone-fill" />
        <path d="M 225 285 L 235 340 Q 215 350 205 340 L 212 285 Z" className="zone-fill" />
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
