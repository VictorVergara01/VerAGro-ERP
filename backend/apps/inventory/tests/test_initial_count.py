from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import EquipmentType
from apps.inventory.models import InitialStockCount, InventoryMovement, Product, ProductCategory
from apps.inventory.services import apply_adjustment, record_initial_count, reserve_stock
from apps.service_orders.models import ServiceOrder, ServiceOrderPart
from apps.service_orders.services import reconcile_part
from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    return User.objects.create_user(email="count@example.com", password="pass", role="inventory", full_name="Almacén")


@pytest.fixture
def client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def product():
    category = ProductCategory.objects.create(name="Motores T50")
    product = Product.objects.create(sku="T50-M1", name="Motor T50", part_number="DJI-MOTOR-01", category=category)
    product.compatible_equipment_types.add(EquipmentType.objects.create(name="T50 conteo"))
    return product


def post_count(client, product, **extra):
    return client.post(f"/api/inventory/products/{product.pk}/initial-count/", {
        "quantity": "5", "unit_cost": "10", "location": "Bodega A / Gaveta 3",
        "expected_updated_at": product.updated_at.isoformat(), **extra,
    }, format="json")


def test_initial_quantity_is_absolute_and_catalog_is_preserved(client, product, user):
    product.stock_quantity = Decimal("3")
    product.average_cost = Decimal("4")
    product.save()
    category_id = product.category_id
    types = list(product.compatible_equipment_types.values_list("pk", flat=True))
    result = post_count(client, product, quantity="5", unit_cost="10")
    assert result.status_code == 201, result.data
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("5")
    assert product.average_cost == Decimal("10")
    assert product.location == "Bodega A / Gaveta 3"
    assert product.category_id == category_id
    assert product.sku == "T50-M1"
    assert list(product.compatible_equipment_types.values_list("pk", flat=True)) == types
    count = InitialStockCount.objects.get(product=product)
    assert count.created_by_id == user.pk
    assert count.quantity_before == Decimal("3")
    assert count.movement.quantity == Decimal("2")
    assert count.movement.reference_type == "initial_count"


def test_zero_count_is_distinct_from_not_counted(client, product):
    before = client.get(f"/api/inventory/products/{product.pk}/").data
    assert before["initial_counted_at"] is None
    result = post_count(client, product, quantity="0", unit_cost=None)
    assert result.status_code == 201
    after = client.get(f"/api/inventory/products/{product.pk}/").data
    assert after["initial_counted_at"] is not None
    assert after["initial_counted_quantity"] == "0.00"
    assert not InventoryMovement.objects.exists()


def test_duplicate_count_does_not_add_stock_twice(client, product):
    assert post_count(client, product).status_code == 201
    assert post_count(client, product).status_code == 400
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("5")
    assert InitialStockCount.objects.count() == 1
    assert InventoryMovement.objects.count() == 1


def test_difference_out_is_audited(client, product):
    product.stock_quantity = 10
    product.average_cost = 7
    product.save()
    assert post_count(client, product, quantity="2", unit_cost="12").status_code == 201
    count = InitialStockCount.objects.get()
    assert count.movement.movement_type == "adjustment_out"
    assert count.movement.quantity == Decimal("8")
    assert count.movement.unit_cost == Decimal("7")
    product.refresh_from_db()
    assert product.average_cost == Decimal("12")


def test_stale_count_does_not_overwrite_a_receipt(client, product, user):
    apply_adjustment(product=product, movement_type="adjustment_in", quantity=2, unit_cost=5, user=user)
    result = post_count(client, product)
    assert result.status_code == 400
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("2")
    assert not InitialStockCount.objects.exists()


def test_count_cannot_erase_reserved_stock(client, product, user):
    product.stock_quantity = 10
    product.save()
    reserve_stock(product=product, quantity=4, user=user)
    product.refresh_from_db()
    assert post_count(client, product, quantity="2").status_code == 400
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("10")
    assert product.reserved_quantity == Decimal("4")


@pytest.mark.parametrize("extra", [{"quantity": "-1"}, {"quantity": ""}, {"quantity": "NaN"}, {"unit_cost": None}, {"unit_cost": "0"}, {"expected_updated_at": None}])
def test_invalid_counts_are_rejected_without_changes(client, product, extra):
    assert post_count(client, product, **extra).status_code == 400
    product.refresh_from_db()
    assert product.stock_quantity == 0
    assert not InitialStockCount.objects.exists()


def test_filters_progress_and_part_number_search(client, product):
    other = Product.objects.create(sku="OTHER-COUNT", name="Otro", category=product.category)
    post_count(client, product, quantity="0", unit_cost=None)
    summary = client.get("/api/inventory/products/count-progress/").data
    assert summary == {"total": 2, "counted": 1, "uncounted": 1, "counted_zero": 1}
    rows = client.get("/api/inventory/products/?count_status=uncounted").data["results"]
    assert [p["id"] for p in rows] == [other.pk]
    zeros = client.get("/api/inventory/products/?count_status=zero").data["results"]
    assert [p["id"] for p in zeros] == [product.pk]
    assert client.get("/api/inventory/products/?search=DJI-MOTOR-01").data["count"] == 1
    assert client.get(f"/api/inventory/products/count-progress/?equipment_type={product.compatible_equipment_types.first().pk}").data["total"] == 1


def test_count_can_be_read_but_not_changed_by_readonly_user(client, product):
    assert post_count(client, product).status_code == 201
    readonly = User.objects.create_user(email="readcount@example.com", password="pass", role="readonly")
    client.force_authenticate(readonly)
    result = client.get(f"/api/inventory/products/{product.pk}/initial-count/")
    assert result.status_code == 200
    assert result.data["counted_by_name"] == "Almacén"
    assert post_count(client, product).status_code == 403


def test_used_part_already_in_count_does_not_consume_again(client, product, user):
    order = ServiceOrder.objects.create(customer=Customer.objects.create(name="Taller"), status="finished")
    part = ServiceOrderPart.objects.create(service_order=order, description="Motor T50", quantity=2, inventory_source="pending", status="pending_inventory")
    assert post_count(client, product, quantity="3").status_code == 201
    reconcile_part(part=part, source="counted", product=product, user=user)
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("3")
    assert InventoryMovement.objects.count() == 1


def test_transaction_rolls_back_if_movement_cannot_be_saved(product, user):
    with patch("apps.inventory.services.InventoryMovement.objects.create", side_effect=RuntimeError("error de prueba")):
        with pytest.raises(RuntimeError):
            record_initial_count(product=product, quantity=5, unit_cost=10, expected_updated_at=product.updated_at, user=user)
    product.refresh_from_db()
    assert product.stock_quantity == 0
    assert not InitialStockCount.objects.exists()
