import { Alert, Linking } from "react-native";

import { formatCurrency } from "../../utils/format";
import { INVOICE_TYPE_LABEL, type Invoice } from "./api";

/** Normaliza un número a formato internacional (Panamá: antepone 507). */
function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("507")) return digits;
  if (digits.length <= 8) return `507${digits}`;
  return digits;
}

function buildMessage(inv: Invoice): string {
  const tipo = (INVOICE_TYPE_LABEL[inv.invoice_type ?? "service_invoice"] ?? "factura").toLowerCase();
  const lines = [
    `Hola ${inv.customer_name ?? ""}`.trim() + ",",
    `Le compartimos su ${tipo} ${inv.invoice_number} por un total de ${formatCurrency(inv.total)}.`,
  ];
  if (Number(inv.balance_due) > 0) {
    lines.push(`Saldo pendiente: ${formatCurrency(inv.balance_due)}.`);
  }
  lines.push("¡Gracias por su preferencia!");
  return lines.join("\n");
}

/** Abre WhatsApp con el mensaje listo para el cliente de la factura. */
export async function sendInvoiceWhatsapp(inv: Invoice) {
  const phone = normalizePhone(inv.customer_whatsapp || inv.customer_phone);
  const text = encodeURIComponent(buildMessage(inv));
  const url = phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;
  const fallback = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  try {
    const can = await Linking.canOpenURL(url);
    await Linking.openURL(can ? url : fallback);
  } catch {
    Alert.alert("WhatsApp", "No se pudo abrir WhatsApp.");
  }
}
