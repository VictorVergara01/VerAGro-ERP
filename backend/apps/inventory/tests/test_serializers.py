from decimal import Decimal

import pytest

from apps.inventory.models import Product
from apps.inventory.serializers import AdjustmentSerializer, ProductSerializer


@pytest.mark.django_db
def test_product_serializer_exposes_available_quantity():
    p = Product.objects.create(
        sku="S1", name="P", stock_quantity=Decimal("10"), reserved_quantity=Decimal("4")
    )
    data = ProductSerializer(p).data
    assert Decimal(str(data["available_quantity"])) == Decimal("6")


@pytest.mark.django_db
def test_product_serializer_stock_is_read_only():
    s = ProductSerializer(
        data={"sku": "S2", "name": "P", "stock_quantity": "99"}
    )
    assert s.is_valid(), s.errors
    obj = s.save()
    assert obj.stock_quantity == Decimal("0")  # ignorado: read-only


@pytest.mark.django_db
def test_product_serializer_average_cost_and_last_purchase_cost_are_read_only():
    # I1: average_cost/last_purchase_cost sólo los toca apply_weighted_average()
    # (backend/apps/inventory/services.py); un PATCH que los escriba directo
    # desincroniza el costo del rango de precios denormalizado (min_sale_price/
    # max_sale_price), del que depende el filtro SQL del reporte de ventas bajo
    # el piso.
    p = Product.objects.create(
        sku="S4", name="P", average_cost=Decimal("10.00"), last_purchase_cost=Decimal("10.00")
    )
    s = ProductSerializer(
        p,
        data={"average_cost": "100.00", "last_purchase_cost": "100.00"},
        partial=True,
    )
    assert s.is_valid(), s.errors
    obj = s.save()
    assert obj.average_cost == Decimal("10.00")
    assert obj.last_purchase_cost == Decimal("10.00")


@pytest.mark.django_db
def test_adjustment_serializer_rejects_non_adjustment_type():
    # El ChoiceField solo admite adjustment_in/out; purchase_in es inválido de entrada.
    p = Product.objects.create(sku="S3", name="P")
    s = AdjustmentSerializer(
        data={"product": p.id, "movement_type": "purchase_in", "quantity": "1"}
    )
    assert s.is_valid() is False
    assert "movement_type" in s.errors
