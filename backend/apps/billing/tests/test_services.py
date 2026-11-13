from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.billing.models import Invoice, InvoiceLine
from apps.billing.services import create_invoice_from_service_order, issue_invoice, recalculate_invoice, record_payment
from apps.customers.models import Customer
from apps.inventory.models import InventoryMovement, Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Cliente SVC")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


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
def test_order_invoiced_when_invoice_paid(customer):
    # Emitir NO marca la orden; el pago total sí (la deja "facturada").
    order = _finished_order_with_part(customer)  # total 100
    invoice = create_invoice_from_service_order(order=order)
    issue_invoice(invoice=invoice)
    order.refresh_from_db()
    assert order.status == ServiceOrder.Status.FINISHED  # aún no facturada

    record_payment(invoice=invoice, amount=Decimal("100"), method="cash")
    invoice.refresh_from_db()
    order.refresh_from_db()
    assert invoice.status == Invoice.Status.PAID
    assert order.status == ServiceOrder.Status.INVOICED


@pytest.mark.django_db
def test_finish_autocreates_invoice(customer):
    from apps.service_orders.services import finish_order

    order = ServiceOrder.objects.create(
        customer=customer,
        status=ServiceOrder.Status.IN_PROGRESS,
        labor_cost=Decimal("80"),
    )
    finish_order(order)
    order.refresh_from_db()
    assert order.status == ServiceOrder.Status.FINISHED
    inv = order.invoices.first()
    assert inv is not None
    assert inv.invoice_type == Invoice.InvoiceType.SERVICE
    assert inv.total == Decimal("80.00")


@pytest.mark.django_db
def test_zero_total_invoice_settles_on_issue(customer):
    # Bug #1: una orden de $0 (diagnóstico gratis) no debe quedar atascada.
    from apps.service_orders.services import finish_order

    order = ServiceOrder.objects.create(
        customer=customer, status=ServiceOrder.Status.IN_PROGRESS
    )  # total 0
    finish_order(order)
    inv = order.invoices.first()
    assert inv.total == Decimal("0.00")
    issue_invoice(invoice=inv)
    inv.refresh_from_db()
    order.refresh_from_db()
    # La factura de 0 queda pagada al emitir y la orden pasa a facturada.
    assert inv.status == Invoice.Status.PAID
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
