"""Generación del PDF de una factura con ReportLab (wheels puras, sin libs de sistema).

Diseño inspirado en una factura comercial limpia: logo + título a la cabeza,
bloques de empresa/contacto, fila resumen, tabla de conceptos, totales a la
derecha y pie con datos de pago.
"""
import os
from io import BytesIO

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.core.models import CompanyProfile

BRAND = colors.HexColor("#2f9e44")
INK = colors.HexColor("#1f2933")
GREY = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")
HEAD_BG = colors.HexColor("#f3f4f6")

CONTENT_W = 18 * cm
DEFAULT_LOGO = os.path.join(os.path.dirname(__file__), "assets", "veragro-logo.png")


def _money(value):
    return f"${value:,.2f}"


def _styles():
    base = getSampleStyleSheet()
    return {
        "invoice_title": ParagraphStyle(
            "invoice_title", parent=base["Title"], fontSize=26, textColor=BRAND,
            alignment=TA_RIGHT, spaceAfter=0, leading=28,
        ),
        "doc_type": ParagraphStyle(
            "doc_type", parent=base["Normal"], fontSize=9.5, textColor=GREY,
            alignment=TA_RIGHT,
        ),
        "number": ParagraphStyle(
            "number", parent=base["Normal"], fontSize=12, textColor=INK,
            alignment=TA_RIGHT, fontName="Helvetica-Bold",
        ),
        "company_name": ParagraphStyle(
            "company_name", parent=base["Normal"], fontSize=12, textColor=INK,
            fontName="Helvetica-Bold", spaceAfter=2,
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"], fontSize=7.5, textColor=GREY,
            fontName="Helvetica-Bold", leading=10,
        ),
        "value": ParagraphStyle("value", parent=base["Normal"], fontSize=10, textColor=INK),
        "normal": ParagraphStyle("normal", parent=base["Normal"], fontSize=9.5, textColor=INK),
        "small": ParagraphStyle("small", parent=base["Normal"], fontSize=8.5, textColor=GREY),
        "cell": ParagraphStyle("cell", parent=base["Normal"], fontSize=9.5, textColor=INK),
        "th": ParagraphStyle(
            "th", parent=base["Normal"], fontSize=8.5, textColor=INK,
            fontName="Helvetica-Bold",
        ),
        "th_r": ParagraphStyle(
            "th_r", parent=base["Normal"], fontSize=8.5, textColor=INK,
            fontName="Helvetica-Bold", alignment=TA_RIGHT,
        ),
        "footer": ParagraphStyle("footer", parent=base["Normal"], fontSize=8.5, textColor=GREY, leading=12),
    }


def _logo_flowable(company):
    path = None
    if company.logo:
        try:
            path = company.logo.path
        except (ValueError, NotImplementedError):
            path = None
    if not path or not os.path.exists(path):
        path = DEFAULT_LOGO if os.path.exists(DEFAULT_LOGO) else None
    if not path:
        return Paragraph(company.name, _styles()["company_name"])
    try:
        # Reducir el logo antes de incrustarlo mantiene el PDF liviano
        # (los originales pueden ser de >1000px y pesar >1 MB).
        from PIL import Image as PILImage

        pil = PILImage.open(path)
        pil.thumbnail((500, 500))
        bio = BytesIO()
        pil.convert("RGB").save(bio, format="PNG")
        bio.seek(0)
        img = Image(bio)
    except Exception:
        try:
            img = Image(path)
        except Exception:
            return Paragraph(company.name, _styles()["company_name"])
    max_h = 26 * mm
    ratio = img.imageWidth / img.imageHeight if img.imageHeight else 1
    img.drawHeight = max_h
    img.drawWidth = max_h * ratio
    img.hAlign = "LEFT"
    return img


def _rule(space_before=8, space_after=8, color=LINE, thickness=0.6):
    return HRFlowable(
        width="100%", thickness=thickness, color=color,
        spaceBefore=space_before, spaceAfter=space_after,
    )


def _header(invoice, company, st):
    right = [
        Paragraph("FACTURA", st["invoice_title"]),
        Paragraph(invoice.get_invoice_type_display(), st["doc_type"]),
        Spacer(1, 4),
        Paragraph(invoice.invoice_number, st["number"]),
    ]
    table = Table([[_logo_flowable(company), right]], colWidths=[9 * cm, 9 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "MIDDLE"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _company_contact(company, st):
    left = [Paragraph(company.legal_name or company.name, st["company_name"])]
    if company.address:
        left.append(Paragraph(company.address.replace("\n", "<br/>"), st["small"]))
    if company.tax_id:
        left.append(Paragraph(f"RUC: {company.tax_id}", st["small"]))

    right = [Paragraph("CONTACTO", st["label"]), Spacer(1, 2)]
    for val in (
        company.phone,
        company.whatsapp and f"WhatsApp: {company.whatsapp}",
        company.email,
    ):
        if val:
            right.append(Paragraph(val, st["small"]))

    table = Table([[left, right]], colWidths=[10.5 * cm, 7.5 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _summary(invoice, st):
    saldo = _money(invoice.balance_due)
    vence = f"{invoice.due_date:%d/%m/%Y}" if invoice.due_date else "—"
    emision = f"{invoice.issue_date:%d/%m/%Y}"
    labels = ["SALDO", "VENCE", "FACTURA #", "EMISIÓN"]
    values = [saldo, vence, invoice.invoice_number, emision]
    rows = [
        [Paragraph(l, st["label"]) for l in labels],
        [Paragraph(f"<b>{v}</b>", st["value"]) for v in values],
    ]
    table = Table(rows, colWidths=[CONTENT_W / 4] * 4)
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
    ]))
    return table


def _bill_to(invoice, st):
    c = invoice.customer
    left = [Paragraph("FACTURAR A", st["label"]), Spacer(1, 2),
            Paragraph(f"<b>{c.name}</b>", st["value"])]
    if getattr(c, "identification_number", ""):
        left.append(Paragraph(c.identification_number, st["small"]))
    contact = " · ".join(x for x in (c.phone, c.email) if x)
    if contact:
        left.append(Paragraph(contact, st["small"]))

    right = []
    if invoice.service_order_id:
        right = [
            Paragraph("ORDEN DE SERVICIO", st["label"]), Spacer(1, 2),
            Paragraph(invoice.service_order.service_order_number, st["value"]),
        ]
    table = Table([[left, right]], colWidths=[10.5 * cm, 7.5 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _items(invoice, st):
    header = [
        Paragraph("#", st["th"]),
        Paragraph("Concepto", st["th"]),
        Paragraph("Cant.", st["th_r"]),
        Paragraph("Precio", st["th_r"]),
        Paragraph("Total", st["th_r"]),
    ]
    rows = [header]
    for i, line in enumerate(invoice.lines.all(), start=1):
        desc = line.description or (line.product.name if line.product else "—")
        rows.append([
            Paragraph(str(i), st["cell"]),
            Paragraph(desc, st["cell"]),
            f"{line.quantity:.2f}",
            _money(line.unit_price),
            _money(line.total),
        ])
    if len(rows) == 1:
        rows.append(["", Paragraph("Sin conceptos.", st["small"]), "", "", ""])

    table = Table(
        rows,
        colWidths=[1 * cm, 9.5 * cm, 2 * cm, 2.75 * cm, 2.75 * cm],
        repeatRows=1,
    )
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 1, INK),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TEXTCOLOR", (2, 1), (-1, -1), INK),
    ]
    table.setStyle(TableStyle(style))
    return table


def _bottom(invoice, company, st):
    # Izquierda: método de pago / notas. Derecha: caja de totales.
    left = []
    if company.invoice_footer:
        left.append(Paragraph("MÉTODO DE PAGO", st["label"]))
        left.append(Spacer(1, 2))
        left.append(Paragraph(company.invoice_footer.replace("\n", "<br/>"), st["small"]))
    if invoice.notes:
        left.append(Spacer(1, 8))
        left.append(Paragraph("NOTAS", st["label"]))
        left.append(Spacer(1, 2))
        left.append(Paragraph(invoice.notes.replace("\n", "<br/>"), st["small"]))

    totals = [["Subtotal", _money(invoice.subtotal)]]
    if invoice.discount_amount:
        totals.append([
            f"Descuento ({invoice.discount_percentage:.2f}%)",
            "−" + _money(invoice.discount_amount),
        ])
    if invoice.tax_amount:
        totals.append([
            f"Impuesto ({invoice.tax_percentage:.2f}%)",
            _money(invoice.tax_amount),
        ])
    totals.append(["Total", _money(invoice.total)])
    if invoice.paid_amount:
        totals.append(["Pagado", _money(invoice.paid_amount)])
    totals.append(["Saldo", _money(invoice.balance_due)])
    total_row = len(totals) - (3 if invoice.paid_amount else 2)

    box = Table(totals, colWidths=[4.2 * cm, 3.3 * cm])
    box.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, total_row), (-1, total_row), 1.2, BRAND),
        ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, total_row), (-1, total_row), INK),
        ("FONTSIZE", (0, total_row), (-1, total_row), 12),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    outer = Table([[left, box]], colWidths=[10.5 * cm, 7.5 * cm])
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer


def _payments(invoice, st):
    payments = invoice.payments.all()
    if not payments:
        return None
    rows = [[
        Paragraph("Fecha", st["th"]), Paragraph("Método", st["th"]),
        Paragraph("Referencia", st["th"]), Paragraph("Monto", st["th_r"]),
    ]]
    for p in payments:
        rows.append([
            f"{p.payment_date:%d/%m/%Y}",
            p.get_method_display(),
            p.reference_number or "—",
            _money(p.amount),
        ])
    table = Table(rows, colWidths=[3 * cm, 4.5 * cm, 6.5 * cm, 4 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 1, INK),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def build_invoice_pdf_bytes(invoice):
    company = CompanyProfile.load()
    st = _styles()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.4 * cm, bottomMargin=1.4 * cm,
        title=invoice.invoice_number,
    )
    story = [
        _header(invoice, company, st),
        Spacer(1, 10),
        _company_contact(company, st),
        _rule(space_before=12, space_after=12),
        _summary(invoice, st),
        _rule(space_before=12, space_after=12),
        _bill_to(invoice, st),
        Spacer(1, 14),
        _items(invoice, st),
        Spacer(1, 14),
        _bottom(invoice, company, st),
    ]
    payments = _payments(invoice, st)
    if payments:
        story += [Spacer(1, 18), Paragraph("<b>Pagos</b>", st["normal"]), Spacer(1, 6), payments]

    doc.build(story)
    return buffer.getvalue()


def render_invoice_pdf(invoice, *, download=False):
    """HttpResponse con el PDF. download=False → inline (ver/imprimir); True → descarga."""
    pdf = build_invoice_pdf_bytes(invoice)
    disposition = "attachment" if download else "inline"
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'{disposition}; filename="{invoice.invoice_number}.pdf"'
    )
    return response
