from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.inventory.models import Product, ProductCategory
from apps.inventory.services import apply_adjustment
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import receive_lines
from apps.suppliers.models import Supplier

User = get_user_model()


@pytest.fixture
def client(db):
    user = User.objects.create_user(
        email="hist@veragro.com", password="x", full_name="H", role="super_admin"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def producto(db):
    categoria = ProductCategory.objects.create(
        name="Repuestos", default_margin_percentage=Decimal("30")
    )
    return Product.objects.create(sku="H1", name="Hélice", category=categoria)


def _comprar(producto, quantity, unit_cost, shipping, supplier_name="DJI Panamá"):
    supplier, _ = Supplier.objects.get_or_create(name=supplier_name)
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal(shipping)
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        product=producto,
        quantity_ordered=Decimal(quantity),
        unit_purchase_cost=Decimal(unit_cost),
    )
    receive_lines(
        purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal(quantity)}]
    )
    return po


@pytest.mark.django_db
def test_historial_desglosa_proveedor_y_flete(client, producto):
    po = _comprar(producto, "10", "20", "100")

    r = client.get(f"/api/inventory/products/{producto.id}/cost-history/")
    assert r.status_code == 200
    fila = r.json()[0]
    assert fila["movement_type"] == "purchase_in"
    assert Decimal(fila["quantity"]) == Decimal("10.00")
    # landed = unit_purchase_cost (20) + flete prorrateado (100/10=10) = 30.0000
    assert Decimal(fila["unit_cost"]) == Decimal("30.0000")
    assert Decimal(fila["average_cost_after"]) == Decimal("30.00")
    assert fila["purchase_order_number"] == po.order_number
    assert fila["supplier_name"] == "DJI Panamá"
    assert Decimal(fila["supplier_unit_cost"]) == Decimal("20.00")
    assert Decimal(fila["allocated_extra_per_unit"]) == Decimal("10.0000")


@pytest.mark.django_db
def test_los_ajustes_no_traen_datos_de_compra(client, producto):
    apply_adjustment(
        product=producto, movement_type="adjustment_in",
        quantity=Decimal("5"), unit_cost=Decimal("12"),
    )
    fila = client.get(f"/api/inventory/products/{producto.id}/cost-history/").json()[0]
    assert fila["movement_type"] == "adjustment_in"
    assert fila["purchase_order_number"] is None
    assert fila["supplier_name"] is None
    assert fila["supplier_unit_cost"] is None
    assert fila["allocated_extra_per_unit"] is None


@pytest.mark.django_db
def test_solo_entradas_y_mas_recientes_primero(client, producto):
    _comprar(producto, "10", "20", "0")
    apply_adjustment(
        product=producto, movement_type="adjustment_out", quantity=Decimal("2")
    )
    filas = client.get(f"/api/inventory/products/{producto.id}/cost-history/").json()
    assert [f["movement_type"] for f in filas] == ["purchase_in"]


@pytest.mark.django_db
def test_misma_orden_con_el_producto_en_dos_lineas(client, producto):
    """Cada movimiento debe apuntar a SU línea, con su propio costo."""
    supplier, _ = Supplier.objects.get_or_create(name="DJI Panamá")
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal("0")
    )
    a = PurchaseOrderLine.objects.create(
        purchase_order=po, product=producto,
        quantity_ordered=Decimal("10"), unit_purchase_cost=Decimal("20"),
    )
    b = PurchaseOrderLine.objects.create(
        purchase_order=po, product=producto,
        quantity_ordered=Decimal("5"), unit_purchase_cost=Decimal("40"),
    )
    receive_lines(
        purchase_order=po,
        receipts=[
            {"line": a.id, "quantity": Decimal("10")},
            {"line": b.id, "quantity": Decimal("5")},
        ],
    )
    costos = {
        Decimal(f["supplier_unit_cost"])
        for f in client.get(f"/api/inventory/products/{producto.id}/cost-history/").json()
    }
    assert costos == {Decimal("20.00"), Decimal("40.00")}


@pytest.mark.django_db
def test_el_historial_no_incurre_en_n_mas_1(client, producto):
    for _ in range(5):
        _comprar(producto, "1", "10", "0")

    with CaptureQueriesContext(connection) as ctx:
        r = client.get(f"/api/inventory/products/{producto.id}/cost-history/")
    assert r.status_code == 200
    assert len(r.json()) == 5
    # producto + movimientos con sus joins; constante, no proporcional a las filas.
    assert len(ctx.captured_queries) <= 6
