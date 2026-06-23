import pytest

from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.fiscal.models import FiscalDocument
from apps.fiscal.services import emit_fiscal_document, void_fiscal_document
from rest_framework.exceptions import ValidationError

pytestmark = pytest.mark.django_db


def _issued_invoice():
    customer = Customer.objects.create(name="Cliente FEL")
    return Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)


def test_emit_creates_authorized_document_with_cufe():
    invoice = _issued_invoice()
    doc = emit_fiscal_document(invoice=invoice)
    assert doc.cufe.startswith("FE") and len(doc.cufe) > 40
    assert doc.fiscal_status == FiscalDocument.FiscalStatus.AUTHORIZED
    assert doc.environment == "demo"


def test_emit_rejects_draft_invoice():
    customer = Customer.objects.create(name="C")
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.DRAFT)
    with pytest.raises(ValidationError):
        emit_fiscal_document(invoice=invoice)


def test_emit_rejects_double_emission():
    invoice = _issued_invoice()
    emit_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    with pytest.raises(ValidationError):
        emit_fiscal_document(invoice=invoice)


def test_emit_generates_unique_cufes():
    a = emit_fiscal_document(invoice=_issued_invoice())
    b = emit_fiscal_document(invoice=_issued_invoice())
    assert a.cufe != b.cufe


def test_void_marks_cancelled():
    invoice = _issued_invoice()
    emit_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    void_fiscal_document(invoice=invoice)
    invoice.refresh_from_db()
    assert invoice.fiscal.fiscal_status == FiscalDocument.FiscalStatus.CANCELLED
    assert invoice.fiscal.cancelled_at is not None
