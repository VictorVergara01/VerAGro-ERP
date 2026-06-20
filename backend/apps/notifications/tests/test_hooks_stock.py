import pytest
from decimal import Decimal

from apps.inventory.models import Product
from apps.inventory.services import apply_adjustment, consume_stock
from apps.notifications import services as notif


@pytest.fixture
def spy_low(monkeypatch):
    calls = []
    monkeypatch.setattr(notif, "notify_low_stock", lambda product: calls.append(product.pk))
    return calls


@pytest.mark.django_db
def test_consume_crossing_threshold_notifies(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("10"), minimum_stock=Decimal("5"))
    consume_stock(product=p, quantity=Decimal("6"))  # 10 -> 4, cruza el 5
    assert spy_low == [p.pk]


@pytest.mark.django_db
def test_consume_already_below_does_not_notify(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("4"), minimum_stock=Decimal("5"))
    consume_stock(product=p, quantity=Decimal("1"))  # 4 -> 3, ya estaba bajo
    assert spy_low == []


@pytest.mark.django_db
def test_consume_staying_above_does_not_notify(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("20"), minimum_stock=Decimal("5"))
    consume_stock(product=p, quantity=Decimal("3"))  # 20 -> 17, sigue arriba
    assert spy_low == []


@pytest.mark.django_db
def test_minimum_zero_never_notifies(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("3"), minimum_stock=Decimal("0"))
    consume_stock(product=p, quantity=Decimal("2"))
    assert spy_low == []


@pytest.mark.django_db
def test_adjustment_out_crossing_notifies(spy_low):
    p = Product.objects.create(sku="P1", name="Hélice", stock_quantity=Decimal("8"), minimum_stock=Decimal("5"))
    apply_adjustment(product=p, movement_type="adjustment_out", quantity=Decimal("5"))  # 8 -> 3, cruza
    assert spy_low == [p.pk]
