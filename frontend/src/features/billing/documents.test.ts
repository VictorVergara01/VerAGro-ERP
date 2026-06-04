import { describe, expect, it } from "vitest";

import {
  buildWhatsappMessage,
  normalizePhone,
  whatsappInvoiceUrl,
} from "./documents";
import type { Invoice } from "./types";

const invoice = {
  id: 1,
  invoice_number: "OS-000023",
  invoice_type: "service_invoice",
  customer_name: "Juan Pérez",
  customer_phone: "6123-4567",
  customer_whatsapp: "",
  total: "150.00",
  balance_due: "50.00",
} as unknown as Invoice;

describe("normalizePhone", () => {
  it("antepone 507 a números locales de Panamá", () => {
    expect(normalizePhone("6123-4567")).toBe("50761234567");
  });
  it("respeta números que ya traen código de país", () => {
    expect(normalizePhone("507 6123 4567")).toBe("50761234567");
  });
  it("devuelve vacío si no hay número", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("whatsappInvoiceUrl", () => {
  it("usa el teléfono del cliente cuando no hay whatsapp", () => {
    const url = whatsappInvoiceUrl(invoice);
    expect(url).toContain("https://wa.me/50761234567?text=");
  });
  it("prioriza el campo whatsapp si existe", () => {
    const url = whatsappInvoiceUrl({ ...invoice, customer_whatsapp: "60009999" });
    expect(url).toContain("https://wa.me/50760009999?text=");
  });
  it("sin número, abre wa.me sin destinatario", () => {
    const url = whatsappInvoiceUrl({
      ...invoice,
      customer_phone: "",
      customer_whatsapp: "",
    });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });
});

describe("buildWhatsappMessage", () => {
  it("incluye número de factura, total y saldo pendiente", () => {
    const msg = buildWhatsappMessage(invoice);
    expect(msg).toContain("OS-000023");
    expect(msg).toContain("Juan Pérez");
    expect(msg).toContain("Saldo pendiente");
  });
  it("omite el saldo cuando está en cero", () => {
    const msg = buildWhatsappMessage({ ...invoice, balance_due: "0.00" });
    expect(msg).not.toContain("Saldo pendiente");
  });
});
