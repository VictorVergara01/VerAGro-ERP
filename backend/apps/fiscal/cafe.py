from io import BytesIO

import qrcode
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.core.models import CompanyProfile


def _money(value):
    return f"${(value or 0):,.2f}"


def _qr_flowable(data):
    img = qrcode.make(data)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=3 * cm, height=3 * cm)


def render_cafe(invoice, download=False) -> HttpResponse:
    company = CompanyProfile.load()
    doc_obj = invoice.fiscal
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8)
    demo = ParagraphStyle(
        "demo", parent=styles["Title"], textColor=colors.red, fontSize=12
    )

    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, title=f"CAFE {invoice.invoice_number}")
    story = []

    story.append(Paragraph(company.name or "Empresa", styles["Title"]))
    story.append(Paragraph("CAFE — Comprobante Auxiliar de Factura Electrónica", styles["Heading3"]))
    story.append(Paragraph("DEMO — sin validez fiscal", demo))
    story.append(Spacer(1, 10))

    cust = invoice.customer
    ident = f"{cust.identification_number}" + (f"-{cust.dv}" if cust.dv else "")
    info = [
        ["Factura:", invoice.invoice_number, "Fecha:", str(invoice.issue_date)],
        ["Cliente:", cust.name, "RUC/Cédula:", ident or "—"],
    ]
    info_table = Table(info, colWidths=[2.5 * cm, 7 * cm, 2.5 * cm, 5 * cm])
    info_table.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9)]))
    story.append(info_table)
    story.append(Spacer(1, 10))

    rows = [["Descripción", "Cant.", "Precio", "Total"]]
    for line in invoice.lines.all():
        rows.append([line.description, str(line.quantity), _money(line.unit_price), _money(line.total)])
    rows.append(["", "", "Total", _money(invoice.total)])
    items = Table(rows, colWidths=[9 * cm, 2 * cm, 3 * cm, 3 * cm])
    items.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c7c54")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ]
        )
    )
    story.append(items)
    story.append(Spacer(1, 14))

    story.append(_qr_flowable(doc_obj.cufe))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>CUFE:</b> {doc_obj.cufe}", small))
    story.append(Paragraph(f"<b>Protocolo de autorización:</b> {doc_obj.protocol}", small))
    story.append(Paragraph(f"<b>Estado:</b> {doc_obj.get_fiscal_status_display()} (ambiente {doc_obj.environment})", small))

    pdf.build(story)
    buf.seek(0)

    response = HttpResponse(buf.getvalue(), content_type="application/pdf")
    disposition = "attachment" if download else "inline"
    response["Content-Disposition"] = f'{disposition}; filename="CAFE-{invoice.invoice_number}.pdf"'
    return response
