import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import Product, ProductCategory
from apps.suppliers.models import Supplier

User = get_user_model()


def _client():
    user = User.objects.create_user(
        email="inv@veragro.com", password="x", full_name="i", role="inventory"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_create_po_with_new_product():
    supplier = Supplier.objects.create(name="Prov")
    cat = ProductCategory.objects.create(name="Cat")
    payload = {
        "supplier": supplier.id,
        "lines": [
            {
                "new_product": {"name": "Filtro nuevo", "category": cat.id},
                "quantity_ordered": "4",
                "unit_purchase_cost": "12",
            },
        ],
    }
    resp = _client().post("/api/purchase-orders/", payload, format="json")
    assert resp.status_code == 201, resp.content
    assert Product.objects.filter(name="Filtro nuevo").exists()
    product = Product.objects.get(name="Filtro nuevo")
    assert product.stock_quantity == 0
    assert product.sku  # autogenerado
    assert resp.data["lines"][0]["product"] == product.id


@pytest.mark.django_db
def test_create_po_line_requires_product_or_new_product():
    supplier = Supplier.objects.create(name="Prov")
    payload = {
        "supplier": supplier.id,
        "lines": [{"quantity_ordered": "1", "unit_purchase_cost": "1"}],
    }
    resp = _client().post("/api/purchase-orders/", payload, format="json")
    assert resp.status_code == 400
