from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.inventory.models import InventoryMovement, Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart
from apps.service_orders.serializers import ServiceOrderPartSerializer
from apps.service_orders.services import finish_order, reconcile_part
from apps.users.models import User

pytestmark = pytest.mark.django_db


def setup_order():
    return ServiceOrder.objects.create(
        customer=Customer.objects.create(name="Cliente manual"), status="in_progress",
    )


def add_manual(order, **extra):
    serializer = ServiceOrderPartSerializer(data={
        "service_order": order.pk, "description": "Motor T50", "quantity": "2",
        "unit_price": "35.00", "inventory_source": "pending", **extra,
    })
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def test_manual_part_finishes_and_invoices_without_stock():
    order = setup_order()
    part = add_manual(order)
    finish_order(order)
    part.refresh_from_db()
    invoice = order.invoices.get()
    assert part.status == "pending_inventory"
    assert invoice.total == Decimal("70")
    assert invoice.lines.get().description == "Motor T50"
    assert invoice.lines.get().product_id is None
    assert not InventoryMovement.objects.exists()


def test_reconcile_closed_order_consumes_once_and_keeps_invoice():
    order = setup_order()
    part = add_manual(order)
    finish_order(order)
    product = Product.objects.create(sku="MAN-1", name="Motor", stock_quantity=5)
    reconcile_part(part=part, source="inventory", product=product)
    with pytest.raises(ValidationError):
        reconcile_part(part=part, source="inventory", product=product)
    product.refresh_from_db()
    part.refresh_from_db()
    assert product.stock_quantity == 3
    assert part.reconciled_at is not None
    assert InventoryMovement.objects.count() == 1
    assert order.invoices.get().total == Decimal("70")


def test_reconcile_cannot_consume_reserved_stock():
    order = setup_order()
    part = add_manual(order)
    product = Product.objects.create(sku="MAN-2", name="Motor", stock_quantity=5, reserved_quantity=4)
    with pytest.raises(ValidationError):
        reconcile_part(part=part, source="inventory", product=product)
    part.refresh_from_db()
    assert part.status == "pending_inventory"
    assert not InventoryMovement.objects.exists()


def test_reconcile_already_in_physical_count_does_not_deduct_again():
    order = setup_order()
    part = add_manual(order)
    finish_order(order)
    product = Product.objects.create(sku="COUNT-1", name="Motor", stock_quantity=3)
    reconcile_part(part=part, source="counted", product=product)
    product.refresh_from_db()
    part.refresh_from_db()
    assert product.stock_quantity == 3
    assert part.product_id == product.pk
    assert part.inventory_source == "counted"
    assert part.status == "used"
    assert not InventoryMovement.objects.exists()


@pytest.mark.parametrize("source", ["customer", "external"])
def test_external_sources_do_not_move_stock(source):
    order = setup_order()
    part = add_manual(order)
    reconcile_part(part=part, source=source)
    finish_order(order)
    part.refresh_from_db()
    assert part.status == "used"
    assert part.inventory_source == source
    assert not InventoryMovement.objects.exists()


def test_known_product_can_be_pending_without_reserving():
    order = setup_order()
    product = Product.objects.create(sku="MAN-3", name="Motor", stock_quantity=0)
    part = add_manual(order, product=product.pk)
    finish_order(order)
    assert part.status == "pending_inventory"
    assert not InventoryMovement.objects.exists()


def test_unavailable_tracked_piece_requires_explicit_pending_choice():
    order = setup_order()
    product = Product.objects.create(sku="MAN-4", name="Motor", stock_quantity=0)
    part = ServiceOrderPart.objects.create(service_order=order, product=product, quantity=2)
    with pytest.raises(ValidationError):
        finish_order(order)
    reconcile_part(part=part, source="pending")
    finish_order(order)
    assert order.invoices.count() == 1


def test_api_manual_reconcile_and_direct_start():
    order = setup_order()
    order.status = "received"
    order.save()
    user = User.objects.create_user(email="manual@example.com", password="testpass", role="technician")
    api = APIClient()
    api.force_authenticate(user)
    assert api.post(f"/api/service-orders/{order.pk}/start-work/").status_code == 200
    response = api.post(f"/api/service-orders/{order.pk}/add-part/", {
        "description": "Hélice", "inventory_source": "pending", "quantity": "1", "unit_price": "12",
    })
    assert response.status_code == 201
    part_id = response.data["id"]
    assert api.post(f"/api/service-orders/{order.pk}/finish/").status_code == 200
    result = api.post(f"/api/service-order-parts/{part_id}/reconcile/", {"source": "customer"})
    assert result.status_code == 200
    assert result.data["reconciled_by"] == user.pk


def test_manual_requires_name_and_positive_quantity():
    order = setup_order()
    for extra in ({"description": ""}, {"quantity": "0"}, {"unit_price": "-1"}):
        with pytest.raises(ValidationError):
            add_manual(order, **extra)
