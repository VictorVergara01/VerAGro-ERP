import { useComputedColorScheme } from "@mantine/core";

import colorDark from "../../assets/veragro-color-dark.png";
import colorLight from "../../assets/veragro-color-light.png";

interface LogoProps {
  height?: number;
  /** Fuerza una variante; por defecto sigue el esquema de color (claro/oscuro). */
  variant?: "light" | "dark";
}

/** Logo de Veragro que escoge la versión adecuada según el fondo:
 * en tema claro usa el logo sobre fondo claro y en tema oscuro el de fondo
 * oscuro, de modo que siempre se integra con la superficie. */
export function Logo({ height = 40, variant }: LogoProps) {
  const scheme = useComputedColorScheme("light");
  const dark = (variant ?? scheme) === "dark";
  return (
    <img
      src={dark ? colorDark : colorLight}
      alt="Veragro"
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
