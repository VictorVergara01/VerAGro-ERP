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
.veragro-zone .arm { fill: none; stroke: var(--mantine-color-dimmed); stroke-width: 11; stroke-linecap: round; transition: stroke 120ms; }
.veragro-zone:hover .arm { stroke: var(--mantine-primary-color-light); }
.veragro-zone.is-selected .arm { stroke: var(--mantine-primary-color-filled); }
.veragro-zone:focus-visible .arm { stroke: var(--mantine-primary-color-filled); }
.veragro-diagram text { fill: var(--mantine-color-dimmed); font-size: 11px; font-family: var(--mantine-font-family-monospace, monospace); }
.veragro-diagram text.zone-label { pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .veragro-zone .zone-fill, .veragro-zone .arm { transition: none; } }
`;

function T50Diagram(props: Omit<ZoneProps, "zoneKey" | "label" | "children">) {
  // Vista superior esquemática del T50, con zonas separadas (sin encimar):
  // el cuerpo central es una pila de tiles (chasis frontal/intermedio/trasero,
  // tanque, sistema centrífugo) con el módulo y el cableado a un costado; los
  // cuatro brazos (M1-M2 izq., M3-M4 der.) terminan en rotores = hélices; el
  // tren de aterrizaje son dos patas al pie y el protector va al frente.
  //
  // Rotores (puntas de brazo): FL, FR arriba; RL, RR abajo.
  const FL = [78, 116] as const;
  const FR = [322, 116] as const;
  const RL = [78, 300] as const;
  const RR = [322, 300] as const;
  const arm = (a: readonly [number, number], b: readonly [number, number]) => (
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="arm" />
  );
  const rotor = (cx: number, cy: number) => (
    <>
      <circle cx={cx} cy={cy} r={22} className="zone-fill" fillOpacity={0.3} />
      <circle cx={cx} cy={cy} r={9} className="zone-fill" />
    </>
  );

  return (
    <svg
      viewBox="0 0 400 400"
      className="veragro-diagram"
      role="group"
      aria-label="Diagrama DJI Agras T50 (vista superior)"
      style={{ width: "100%", height: "auto" }}
    >
      <style>{ZONE_CSS}</style>

      {/* Protector frontal (nariz, al frente) */}
      <Zone zoneKey="protector_frontal" label="Protector frontal" {...props}>
        <path d="M 168 58 Q 200 30 232 58 L 228 74 Q 200 54 172 74 Z" className="zone-fill" />
        <text className="zone-label" x={200} y={52} textAnchor="middle">PROT.</text>
      </Zone>

      {/* Brazos M1-M2 (dos brazos izquierdos) */}
      <Zone zoneKey="brazos_m1_m2" label="Brazos M1-M2" {...props}>
        {arm([152, 168], FL)}
        {arm([152, 290], RL)}
        <text className="zone-label" x={116} y={212} textAnchor="middle">M1·M2</text>
      </Zone>

      {/* Brazos M3-M4 (dos brazos derechos) */}
      <Zone zoneKey="brazos_m3_m4" label="Brazos M3-M4" {...props}>
        {arm([248, 168], FR)}
        {arm([248, 290], RR)}
        <text className="zone-label" x={285} y={238} textAnchor="middle">M3·M4</text>
      </Zone>

      {/* Hélices: los cuatro rotores en las puntas de los brazos */}
      <Zone zoneKey="helices" label="Hélices" {...props}>
        {rotor(...FL)}
        {rotor(...FR)}
        {rotor(...RL)}
        {rotor(...RR)}
        <text className="zone-label" x={200} y={100} textAnchor="middle">HÉLICES</text>
      </Zone>

      {/* Tren de aterrizaje: dos patas al pie */}
      <Zone zoneKey="tren_aterrizaje" label="Tren de aterrizaje" {...props}>
        <path d="M 178 316 L 170 362 Q 184 370 192 362 L 190 316 Z" className="zone-fill" />
        <path d="M 222 316 L 230 362 Q 216 370 208 362 L 210 316 Z" className="zone-fill" />
        <text className="zone-label" x={200} y={384} textAnchor="middle">TREN</text>
      </Zone>

      {/* Cuerpo central: pila de tiles (sin encimar) */}
      <Zone zoneKey="chasis_frontal" label="Chasis frontal" {...props}>
        <rect x={150} y={118} width={100} height={30} rx={7} className="zone-fill" />
        <text className="zone-label" x={200} y={137} textAnchor="middle">CH.FRONT</text>
      </Zone>

      <Zone zoneKey="tanque_fumigacion" label="Tanque de fumigación" {...props}>
        <rect x={150} y={154} width={100} height={58} rx={10} className="zone-fill" />
        <text className="zone-label" x={200} y={187} textAnchor="middle">TANQUE</text>
      </Zone>

      <Zone zoneKey="chasis_intermedio" label="Chasis intermedio" {...props}>
        <rect x={150} y={218} width={100} height={28} rx={7} className="zone-fill" />
        <text className="zone-label" x={200} y={236} textAnchor="middle">CH.INTER</text>
      </Zone>

      <Zone zoneKey="sistema_centrifugo" label="Sistema centrífugo" {...props}>
        <rect x={150} y={252} width={100} height={28} rx={7} className="zone-fill" />
        <text className="zone-label" x={200} y={270} textAnchor="middle">CENTRÍF.</text>
      </Zone>

      <Zone zoneKey="chasis_trasero" label="Chasis trasero" {...props}>
        <rect x={150} y={286} width={100} height={28} rx={7} className="zone-fill" />
        <text className="zone-label" x={200} y={304} textAnchor="middle">CH.TRAS</text>
      </Zone>

      {/* Módulo de distribución y cableado: tiles al costado del tanque */}
      <Zone zoneKey="modulo_distribucion" label="Módulo de distribución" {...props}>
        <rect x={256} y={154} width={44} height={26} rx={5} className="zone-fill" />
        <text className="zone-label" x={278} y={171} textAnchor="middle">MÓD.</text>
      </Zone>

      <Zone zoneKey="cableado_chasis" label="Cableado de chasis" {...props}>
        <rect x={256} y={186} width={44} height={26} rx={5} className="zone-fill" />
        <text className="zone-label" x={278} y={203} textAnchor="middle">CBL.</text>
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
