import { API_BASE_URL } from "../../lib/api/client";
import { getAccess } from "../../lib/auth/tokens";
import { formatCurrency } from "../../utils/format";
import { INVOICE_TYPE_LABEL, type Invoice } from "./types";

/** Descarga el PDF de la factura (fetch autenticado → blob). `download`
 * controla Content-Disposition: true descarga, false abre inline. */
async function fetchInvoicePdfBlob(
  invoiceId: number,
  download: boolean,
): Promise<Blob> {
  const token = getAccess();
  const res = await fetch(
    `${API_BASE_URL}/api/invoices/${invoiceId}/pdf/${download ? "?download=1" : ""}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) {
    throw new Error("No se pudo generar el PDF.");
  }
  return res.blob();
}

export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
  const blob = await fetchInvoicePdfBlob(invoice.id, true);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoice.invoice_number ?? "factura"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberar el object URL tras un momento (deja que el navegador inicie la descarga).
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function printInvoicePdf(invoice: Invoice): Promise<void> {
  const blob = await fetchInvoicePdfBlob(invoice.id, false);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    // Algunos navegadores necesitan que el PDF cargue antes de imprimir.
    win.addEventListener("load", () => win.print());
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Normaliza un número a formato internacional sin signos para wa.me.
 * Panamá: si es local (≤8 dígitos) antepone el código de país 507. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("507")) return digits;
  if (digits.length <= 8) return `507${digits}`;
  return digits;
}

export function buildWhatsappMessage(invoice: Invoice): string {
  const tipo = INVOICE_TYPE_LABEL[invoice.invoice_type ?? "service_invoice"] ?? "factura";
  const total = formatCurrency(invoice.total);
  const saldo = formatCurrency(invoice.balance_due);
  const lines = [
    `Hola ${invoice.customer_name ?? ""}`.trim() + ",",
    `Le compartimos su ${tipo.toLowerCase()} *${invoice.invoice_number}* por un total de ${total}.`,
  ];
  if (Number(invoice.balance_due) > 0) {
    lines.push(`Saldo pendiente: ${saldo}.`);
  }
  lines.push("Adjuntamos el PDF. ¡Gracias por su preferencia!");
  return lines.join("\n");
}

/** Devuelve la URL wa.me con el mensaje, o null si el cliente no tiene número. */
export function whatsappInvoiceUrl(invoice: Invoice): string | null {
  const phone = normalizePhone(invoice.customer_whatsapp || invoice.customer_phone);
  const text = encodeURIComponent(buildWhatsappMessage(invoice));
  // Sin número: abre WhatsApp con el mensaje para elegir contacto manualmente.
  return phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
}
