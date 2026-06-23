import pytest

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer
from apps.fiscal.cafe import render_cafe
from apps.fiscal.services import emit_fiscal_document

pytestmark = pytest.mark.django_db


def _invoice_with_fiscal():
    customer = Customer.objects.create(name="Cliente FEL", identification_number="155-1", dv="22")
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED, total=100)
    InvoiceLine.objects.create(invoice=invoice, description="Servicio", quantity=1, unit_price=100, total=100)
    emit_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    return invoice


def test_render_cafe_returns_pdf():
    invoice = _invoice_with_fiscal()
    response = render_cafe(invoice)
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_render_cafe_download_is_attachment():
    invoice = _invoice_with_fiscal()
    response = render_cafe(invoice, download=True)
    assert "attachment" in response["Content-Disposition"]
