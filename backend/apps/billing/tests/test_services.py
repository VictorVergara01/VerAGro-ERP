from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.billing.models import Invoice, InvoiceLine, Quote, QuoteLine
from apps.billing.services import (
    convert_quote_to_invoice,
    create_invoice_from_service_order,
    create_quote_from_service_order,
    issue_invoice,
    recalculate_invoice,
    recalculate_quote,
    record_payment,
)
from apps.customers.models import Customer
from apps.inventory.models import InventoryMovement, Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Cliente SVC")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


@pytest.mark.django_db
def test_recalculate_quote(customer):
    q = Quote.objects.create(
        customer=customer,
        discount_percentage=Decimal("10"),
        tax_percentage=Decimal("5"),
    )
    QuoteLine.objects.create(quote=q, description="A", quantity=2, unit_price=30)  # 60
    QuoteLine.objects.create(quote=q, description="B", quantity=1, unit_price=40)  # 40
    recalculate_quote(q)
    q.refresh_from_db()
    assert q.subtotal == Decimal("100.00")
    # desc 10% = 10; gravable 90; imp 5% = 4.50; total 94.50
    assert q.discount_amount == Decimal("10.00")
    assert q.tax_amount == Decimal("4.50")
    assert q.total == Decimal("94.50")


@pytest.mark.django_db
def test_recalculate_invoice_margin_and_balance(customer):
    inv = Invoice.objects.create(customer=customer)
    InvoiceLine.objects.create(
        invoice=inv, description="A", quantity=2, unit_price=50, unit_cost=30
    )
    recalculate_invoice(inv)
    inv.refresh_from_db()
    assert inv.subtotal == Decimal("100.00")
    assert inv.total == Decimal("100.00")
    assert inv.balance_due == Decimal("100.00")
    line = inv.lines.first()
    assert line.margin_amount == Decimal("40.00")  # (50-30)*2


@pytest.mark.django_db
def test_payment_status_transitions(customer):
    inv = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)
    InvoiceLine.objects.create(invoice=inv, description="A", quantity=1, unit_price=100)
    recalculate_invoice(inv)

    record_payment(invoice=inv, amount=Decimal("40"), method="cash")
    inv.refresh_from_db()
    assert inv.status == Invoice.Status.PARTIALLY_PAID
    assert inv.balance_due == Decimal("60.00")

    record_payment(invoice=inv, amount=Decimal("60"), method="cash")
    inv.refresh_from_db()
    assert inv.status == Invoice.Status.PAID
    assert inv.balance_due == Decimal("0.00")


@pytest.mark.django_db
def test_payment_on_draft_blocked(customer):
    inv = Invoice.objects.create(customer=customer)  # draft
    with pytest.raises(ValidationError):
        record_payment(invoice=inv, amount=Decimal("10"), method="cash")


def _finished_order_with_part(customer):
    order = ServiceOrder.objects.create(
        customer=customer,
        status=ServiceOrder.Status.FINISHED,
        labor_cost=Decimal("50"),
        diagnostic_fee=Decimal("20"),
    )
    product = _product("OP1", average_cost=Decimal("8"))
    ServiceOrderPart.objects.create(
        service_order=order,
        product=product,
        quantity=2,
        unit_cost=Decimal("8"),
        unit_price=Decimal("15"),
        status=ServiceOrderPart.Status.USED,
    )
    return order


@pytest.mark.django_db
def test_create_quote_from_service_order(customer):
    order = _finished_order_with_part(customer)
    quote = create_quote_from_service_order(order=order)
    types = sorted(line.line_type for line in quote.lines.all())
    assert types == ["diagnostic", "labor", "product"]
    # 50 + 20 + 2*15 = 100
    assert quote.total == Decimal("100.00")


@pytest.mark.django_db
def test_create_invoice_from_service_order_no_inventory_move(customer):
    order = _finished_order_with_part(customer)
    product = order.parts.first().product
    stock_before = product.stock_quantity
    invoice = create_invoice_from_service_order(order=order)
    assert invoice.invoice_type == Invoice.InvoiceType.SERVICE
    assert invoice.total == Decimal("100.00")
    product.refresh_from_db()
    # No descuenta inventario (ya se consumió en finish).
    assert product.stock_quantity == stock_before
    assert not InventoryMovement.objects.filter(
        product=product, movement_type="sale_out"
    ).exists()


@pytest.mark.django_db
def test_create_invoice_requires_finished(customer):
    order = ServiceOrder.objects.create(customer=customer)  # received
    with pytest.raises(ValidationError):
        create_invoice_from_service_order(order=order)


@pytest.mark.django_db
def test_issue_invoice_sets_order_invoiced(customer):
    order = _finished_order_with_part(customer)
    invoice = create_invoice_from_service_order(order=order)
    issue_invoice(invoice=invoice)
    order.refresh_from_db()
    invoice.refresh_from_db()
    assert invoice.status == Invoice.Status.ISSUED
    assert order.status == ServiceOrder.Status.INVOICED


@pytest.mark.django_db
def test_issue_product_sale_deducts_inventory(customer):
    product = _product("PS1", stock_quantity=Decimal("10"))
    inv = Invoice.objects.create(
        customer=customer, invoice_type=Invoice.InvoiceType.PRODUCT_SALE
    )
    InvoiceLine.objects.create(
        invoice=inv, product=product, description="Venta", quantity=3, unit_price=20
    )
    recalculate_invoice(inv)
    issue_invoice(invoice=inv)
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("7")
    mov = InventoryMovement.objects.get(product=product, movement_type="sale_out")
    assert mov.quantity == Decimal("3")
    assert mov.reference_id == inv.id


@pytest.mark.django_db
def test_convert_quote_requires_approved(customer):
    q = Quote.objects.create(customer=customer)  # draft
    with pytest.raises(ValidationError):
        convert_quote_to_invoice(quote=q)


@pytest.mark.django_db
def test_convert_quote_to_invoice(customer):
    q = Quote.objects.create(customer=customer, status=Quote.Status.APPROVED)
    QuoteLine.objects.create(quote=q, description="A", quantity=1, unit_price=100)
    recalculate_quote(q)
    invoice = convert_quote_to_invoice(quote=q)
    q.refresh_from_db()
    assert q.status == Quote.Status.CONVERTED
    assert invoice.quote_id == q.id
    assert invoice.total == Decimal("100.00")
