export const colors = {
  primary: "#2f9e44",
  bg: "#f5f6f8",
  card: "#ffffff",
  text: "#1a1b1e",
  dimmed: "#868e96",
  border: "#e9ecef",
  danger: "#e03131",
};

export const statusColors: Record<string, string> = {
  received: "#868e96",
  in_diagnostic: "#15aabf",
  quoted: "#4263eb",
  approved: "#1971c2",
  in_progress: "#f08c00",
  waiting_parts: "#e8590c",
  finished: "#0ca678",
  invoiced: "#9c36b5",
  delivered: "#2f9e44",
  cancelled: "#e03131",
};

export const statusLabels: Record<string, string> = {
  received: "Recibida",
  in_diagnostic: "En diagnóstico",
  quoted: "Cotizada",
  approved: "Aprobada",
  in_progress: "En proceso",
  waiting_parts: "Esperando piezas",
  finished: "Finalizada",
  invoiced: "Facturada",
  delivered: "Entregada",
  cancelled: "Cancelada",
};
