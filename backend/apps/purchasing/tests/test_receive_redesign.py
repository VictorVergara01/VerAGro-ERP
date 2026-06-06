from decimal import Decimal

import pytest

from apps.inventory.models import Product, ProductCategory
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import receive_lines
from apps.suppliers.models import Supplier, SupplierProduct


@pytest.fixture
def order(db):
    cat = ProductCategory.objects.create(name="Cat", default_margin_percentage=Decimal("20"))
    supplier = Supplier.objects.create(name="Prov")
    product = Product.objects.create(sku="P1", name="Pieza", category=cat)  # sin margen propio
    po = PurchaseOrder.objects.create(supplier=supplier, status=PurchaseOrder.Status.SENT)
    line = PurchaseOrderLine.objects.create(
        purchase_order=po, product=product,
        quantity_ordered=Decimal("10"), unit_purchase_cost=Decimal("5"),
    )
    return po, line, product, supplier


@pytest.mark.django_db
def test_receive_sets_sale_price_from_inventory_margin(order):
    po, line, product, supplier = order
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("10")}])
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("10.00")
    # landed = 5 (sin costos extra); margen de categoría 20% → 6.00
    assert product.sale_price == Decimal("6.00")


@pytest.mark.django_db
def test_receive_creates_supplier_product_and_main_supplier(order):
    po, line, product, supplier = order
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("10")}])
    sp = SupplierProduct.objects.get(supplier=supplier, product=product)
    assert sp.last_cost == Decimal("5.00")
    product.refresh_from_db()
    assert product.main_supplier_id == supplier.id


@pytest.mark.django_db
def test_receive_does_not_override_existing_main_supplier(order):
    po, line, product, supplier = order
    other = Supplier.objects.create(name="Otro")
    product.main_supplier = other
    product.save(update_fields=["main_supplier"])
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("10")}])
    product.refresh_from_db()
    assert product.main_supplier_id == other.id  # no se pisa
