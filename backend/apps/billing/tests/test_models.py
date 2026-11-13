import pytest

from apps.billing.models import Invoice, InvoiceLine, Payment
from apps.customers.models import Customer


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Cliente Billing")


@pytest.mark.django_db
def test_invoice_number_prefix_by_type(customer):
    # Factura de orden de servicio → OS-; venta de producto → FAC-.
    service = Invoice.objects.create(
        customer=customer, invoice_type=Invoice.InvoiceType.SERVICE
    )
    assert service.invoice_number == f"OS-{service.pk:06d}"
    assert service.status == Invoice.Status.DRAFT

    sale = Invoice.objects.create(
        customer=customer, invoice_type=Invoice.InvoiceType.PRODUCT_SALE
    )
    assert sale.invoice_number == f"FAC-{sale.pk:06d}"

    final = Invoice.objects.create(
        customer=customer, invoice_type=Invoice.InvoiceType.FINAL
    )
    assert final.invoice_number == f"FAC-{final.pk:06d}"


@pytest.mark.django_db
def test_cascade_invoice_lines_and_payments(customer):
    inv = Invoice.objects.create(customer=customer)
    InvoiceLine.objects.create(invoice=inv, description="X", quantity=1, unit_price=10)
    Payment.objects.create(invoice=inv, amount=5)
    iid = inv.id
    inv.delete()
    assert not InvoiceLine.objects.filter(invoice_id=iid).exists()
    assert not Payment.objects.filter(invoice_id=iid).exists()
