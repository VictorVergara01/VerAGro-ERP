/** Extrae el mensaje de error específico que manda DRF (campo o `detail`). */
export function userErrorMessage(error: unknown, fallback: string): string {
  const body = error as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.detail === "string") return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}
