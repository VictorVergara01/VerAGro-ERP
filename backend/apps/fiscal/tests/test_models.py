import pytest

from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.fiscal.models import FiscalDocument

pytestmark = pytest.mark.django_db


def test_fiscal_document_str_and_defaults():
    customer = Customer.objects.create(name="Cliente FEL")
    invoice = Invoice.objects.create(customer=customer)
    doc = FiscalDocument.objects.create(invoice=invoice, cufe="FE" + "a" * 64)
    assert doc.fiscal_status == FiscalDocument.FiscalStatus.AUTHORIZED
    assert doc.environment == FiscalDocument.Environment.DEMO
    assert str(doc).startswith("FE")
    assert invoice.fiscal == doc
