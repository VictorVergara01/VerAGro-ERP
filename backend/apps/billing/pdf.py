"""Generación del PDF de una factura con ReportLab (wheels puras, sin libs de sistema)."""
from io import BytesIO

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.core.models import CompanyProfile

BRAND = colors.HexColor("#2f9e44")
GREY = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")


def _money(value):
    return f"${value:,.2f}"


def _styles():
    base = getSampleStyleSheet()
    return {
        "company": ParagraphStyle(
            "company", parent=base["Title"], fontSize=18, textColor=BRAND,
            spaceAfter=2, alignment=0,
        ),
        "small": ParagraphStyle("small", parent=base["Normal"], fontSize=8.5, textColor=GREY),
        "normal": ParagraphStyle("normal", parent=base["Normal"], fontSize=9.5),
        "doc_title": ParagraphStyle(
            "doc_title", parent=base["Normal"], fontSize=14, alignment=TA_RIGHT,
            fontName="Helvetica-Bold",
        ),
        "meta": ParagraphStyle("meta", parent=base["Normal"], fontSize=9, alignment=TA_RIGHT),
        "cell": ParagraphStyle("cell", parent=base["Normal"], fontSize=9),
        "footer": ParagraphStyle("footer", parent=base["Normal"], fontSize=8.5, textColor=GREY),
    }


def _logo_flowable(company):
    if not company.logo:
        return None
    try:
        path = company.logo.path
    except (ValueError, NotImplementedError):
        return None
    try:
        img = Image(path)
    except Exception:
        return None
    max_h = 22 * mm
    ratio = img.imageWidth / img.imageHeight if img.imageHeight else 1
    img.drawHeight = max_h
    img.drawWidth = max_h * ratio
    img.hAlign = "LEFT"
    return img


def _header(invoice, company, st):
    left = []
    logo = _logo_flowable(company)
    if logo:
        left.append(logo)
        left.append(Spacer(1, 4))
    left.append(Paragraph(company.name, st["company"]))
    if company.legal_name:
        left.append(Paragraph(company.legal_name, st["normal"]))
    if company.tax_id:
        left.append(Paragraph(f"RUC: {company.tax_id}", st["small"]))
    if company.address:
        left.append(Paragraph(company.address.replace("\n", "<br/>"), st["small"]))
    contact = " · ".join(
        x for x in (
            f"Tel: {company.phone}" if company.phone else "",
            company.email,
        ) if x
    )
    if contact:
        left.append(Paragraph(contact, st["small"]))

    right = [
        Paragraph(invoice.get_invoice_type_display(), st["doc_title"]),
        Paragraph(f"<b>{invoice.invoice_number}</b>", st["meta"]),
        Spacer(1, 8),
        Paragraph(f"Emisión: {invoice.issue_date:%d/%m/%Y}", st["meta"]),
    ]
    if invoice.due_date:
        right.append(Paragraph(f"Vence: {invoice.due_date:%d/%m/%Y}", st["meta"]))
    right.append(Paragraph(f"Estado: <b>{invoice.get_status_display()}</b>", st["meta"]))

    table = Table([[left, right]], colWidths=[10.5 * cm, 6.5 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _customer_box(invoice, st):
    c = invoice.customer
    parts = [f"<b>{c.name}</b>"]
    if getattr(c, "identification_number", ""):
        parts.append(c.identification_number)
    line1 = " · ".join(parts)
    extra = []
    if c.phone:
        extra.append(f"Tel: {c.phone}")
    if c.email:
        extra.append(c.email)
    text = f"<font color='#6b7280'>Cliente:</font> {line1}"
    if extra:
        text += "<br/>" + " · ".join(extra)
    box = Table([[Paragraph(text, st["cell"])]], colWidths=[17 * cm])
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return box


def _items_table(invoice, st):
    header = ["Concepto", "Cant.", "Precio", "Total"]
    rows = [header]
    for line in invoice.lines.all():
        desc = line.description or (line.product.name if line.product else "—")
        rows.append([
            Paragraph(desc, st["cell"]),
            f"{line.quantity:.2f}",
            _money(line.unit_price),
            _money(line.total),
        ])
    if len(rows) == 1:
        rows.append([Paragraph("Sin conceptos.", st["small"]), "", "", ""])

    table = Table(rows, colWidths=[8.5 * cm, 2.2 * cm, 3.15 * cm, 3.15 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _totals_table(invoice, st):
    rows = [["Subtotal", _money(invoice.subtotal)]]
    if invoice.discount_amount:
        rows.append([
            f"Descuento ({invoice.discount_percentage:.2f}%)",
            "−" + _money(invoice.discount_amount),
        ])
    if invoice.tax_amount:
        rows.append([
            f"Impuesto ({invoice.tax_percentage:.2f}%)",
            _money(invoice.tax_amount),
        ])
    rows.append(["Total", _money(invoice.total)])
    if invoice.paid_amount:
        rows.append(["Pagado", _money(invoice.paid_amount)])
    rows.append(["Saldo", _money(invoice.balance_due)])

    total_row = len(rows) - (3 if invoice.paid_amount else 2)
    inner = Table(rows, colWidths=[4.2 * cm, 3.3 * cm])
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEABOVE", (0, total_row), (-1, total_row), 1.2, BRAND),
        ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, total_row), (0, total_row), colors.black),
        ("FONTSIZE", (0, total_row), (-1, total_row), 11.5),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]
    inner.setStyle(TableStyle(style))
    wrapper = Table([["", inner]], colWidths=[9.5 * cm, 7.5 * cm])
    wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return wrapper


def _payments_table(invoice, st):
    payments = invoice.payments.all()
    if not payments:
        return None
    rows = [["Fecha", "Método", "Ref.", "Monto"]]
    for p in payments:
        rows.append([
            f"{p.payment_date:%d/%m/%Y}",
            p.get_method_display(),
            p.reference_number or "—",
            _money(p.amount),
        ])
    table = Table(rows, colWidths=[3 * cm, 4 * cm, 6 * cm, 4 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def build_invoice_pdf_bytes(invoice):
    company = CompanyProfile.load()
    st = _styles()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        title=invoice.invoice_number,
    )
    story = [
        _header(invoice, company, st),
        Spacer(1, 14),
        _customer_box(invoice, st),
        Spacer(1, 14),
        _items_table(invoice, st),
        Spacer(1, 10),
        _totals_table(invoice, st),
    ]
    payments = _payments_table(invoice, st)
    if payments:
        story += [Spacer(1, 16), Paragraph("<b>Pagos</b>", st["normal"]), Spacer(1, 4), payments]
    if invoice.notes:
        story += [Spacer(1, 14), Paragraph(f"<b>Notas:</b> {invoice.notes}", st["footer"])]
    if company.invoice_footer:
        story += [Spacer(1, 8), Paragraph(company.invoice_footer.replace("\n", "<br/>"), st["footer"])]

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
