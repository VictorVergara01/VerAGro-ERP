from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.customers.models import Customer
from apps.inventory.models import InventoryMovement, Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart
from apps.service_orders.services import (
    cancel_order,
    finish_order,
    recalculate_totals,
    reserve_parts,
)


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Cliente Servicios")


def _order(customer, **kwargs):
    return ServiceOrder.objects.create(customer=customer, **kwargs)


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


def _part(order, product, qty, **kwargs):
    return ServiceOrderPart.objects.create(
        service_order=order, product=product, quantity=qty, **kwargs
    )


@pytest.mark.django_db
def test_recalculate_totals(customer):
    order = _order(
        customer,
        labor_cost=Decimal("100"),
        diagnostic_fee=Decimal("20"),
        discount_amount=Decimal("10"),
        tax_amount=Decimal("5"),
    )
    p = _product("T1")
    _part(order, p, Decimal("2"), unit_price=Decimal("30"))  # 60
    recalculate_totals(order)
    order.refresh_from_db()
    # 100 + 20 + 60 - 10 + 5 = 175
    assert order.total_amount == Decimal("175.00")


@pytest.mark.django_db
def test_recalculate_ignores_returned_parts(customer):
    order = _order(customer, labor_cost=Decimal("50"))
    p = _product("T2")
    _part(
        order,
        p,
        Decimal("1"),
        unit_price=Decimal("40"),
        status=ServiceOrderPart.Status.RETURNED,
    )
    recalculate_totals(order)
    order.refresh_from_db()
    assert order.total_amount == Decimal("50.00")  # pieza devuelta no suma


@pytest.mark.django_db
def test_reserve_parts_reserves_available_and_marks_pending(customer):
    order = _order(customer)
    have = _product("R-OK", stock_quantity=Decimal("10"))
    short = _product("R-SHORT", stock_quantity=Decimal("1"))
    p_ok = _part(order, have, Decimal("4"))
    p_short = _part(order, short, Decimal("5"))

    summary = reserve_parts(order)
    p_ok.refresh_from_db()
    p_short.refresh_from_db()
    have.refresh_from_db()
    order.refresh_from_db()

    assert p_ok.status == ServiceOrderPart.Status.RESERVED
    assert p_short.status == ServiceOrderPart.Status.PENDING_PURCHASE
    assert have.reserved_quantity == Decimal("4")
    assert summary == {"reserved": [p_ok.id], "pending": [p_short.id]}
    # Hay pendiente de compra → orden en waiting_parts.
    assert order.status == ServiceOrder.Status.WAITING_PARTS


@pytest.mark.django_db
def test_finish_consumes_reserved_parts(customer):
    order = _order(customer, status=ServiceOrder.Status.IN_PROGRESS)
    product = _product("F1", stock_quantity=Decimal("10"))
    part = _part(order, product, Decimal("3"), unit_cost=Decimal("8"))
    # reservar primero (simula reserve-parts)
    part.status = ServiceOrderPart.Status.RESERVED
    part.save()
    product.reserved_quantity = Decimal("3")
    product.save()

    finish_order(order)
    order.refresh_from_db()
    part.refresh_from_db()
    product.refresh_from_db()

    assert order.status == ServiceOrder.Status.FINISHED
    assert order.finished_date is not None
    assert part.status == ServiceOrderPart.Status.USED
    assert product.stock_quantity == Decimal("7")
    assert product.reserved_quantity == Decimal("0")
    mov = InventoryMovement.objects.get(
        product=product, movement_type="service_out"
    )
    assert mov.quantity == Decimal("3")
    assert mov.reference_type == "service_order"


@pytest.mark.django_db
def test_finish_requires_in_progress(customer):
    order = _order(customer, status=ServiceOrder.Status.APPROVED)
    with pytest.raises(ValidationError):
        finish_order(order)


@pytest.mark.django_db
def test_cancel_releases_reservations(customer):
    order = _order(customer)
    product = _product("C1", stock_quantity=Decimal("10"))
    part = _part(order, product, Decimal("4"))
    reserve_parts(order)
    product.refresh_from_db()
    assert product.reserved_quantity == Decimal("4")

    cancel_order(order)
    order.refresh_from_db()
    part.refresh_from_db()
    product.refresh_from_db()

    assert order.status == ServiceOrder.Status.CANCELLED
    assert part.status == ServiceOrderPart.Status.RETURNED
    assert product.reserved_quantity == Decimal("0")
    assert product.stock_quantity == Decimal("10")  # nunca se descontó físico
    assert InventoryMovement.objects.filter(
        product=product, movement_type="reservation_release"
    ).exists()


@pytest.mark.django_db
def test_cancel_delivered_blocked(customer):
    order = _order(customer, status=ServiceOrder.Status.DELIVERED)
    with pytest.raises(ValidationError):
        cancel_order(order)
