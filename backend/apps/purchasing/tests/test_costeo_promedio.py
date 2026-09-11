from decimal import Decimal

import pytest

from apps.inventory.models import InventoryMovement, Product, ProductCategory
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import receive_lines
from apps.suppliers.models import Supplier


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="DJI Panamá")


@pytest.fixture
def categoria(db):
    return ProductCategory.objects.create(
        name="Repuestos", default_margin_percentage=Decimal("30")
    )


def _comprar(supplier, product, quantity, unit_cost, shipping):
    """Crea una orden de una línea, la envía y la recibe completa."""
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal(shipping)
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        product=product,
        quantity_ordered=Decimal(quantity),
        unit_purchase_cost=Decimal(unit_cost),
    )
    receive_lines(
        purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal(quantity)}]
    )
    return po, line


@pytest.mark.django_db
def test_dos_compras_con_flete_distinto_promedian_el_costo(supplier, categoria):
    """10 @ $20 con $50 de flete, luego 10 @ $20 con $100 de flete.

    El flete ya viene prorrateado (orden de una sola línea: sin prorrateo, todo el
    flete cae en esa línea; el spec original prorratea 50/50 entre dos líneas).
    """
    helice = Product.objects.create(sku="HEL", name="Hélice", category=categoria)

    _comprar(supplier, helice, "10", "20", "50")
    helice.refresh_from_db()
    assert helice.average_cost == Decimal("25.00")   # (200 + 50) / 10

    _comprar(supplier, helice, "10", "20", "100")
    helice.refresh_from_db()
    assert helice.average_cost == Decimal("27.50")   # (10*25 + 10*30) / 20


@pytest.mark.django_db
def test_el_precio_sale_del_promedio_no_del_ultimo_landed(supplier, categoria):
    """El bug original: el precio usaba el landed de la última compra (39.00)."""
    helice = Product.objects.create(sku="HEL2", name="Hélice", category=categoria)

    _comprar(supplier, helice, "10", "20", "50")
    _comprar(supplier, helice, "10", "20", "100")
    helice.refresh_from_db()

    assert helice.average_cost == Decimal("27.50")
    assert helice.last_purchase_cost == Decimal("30.00")   # último landed, correcto
    assert helice.sale_price == Decimal("35.75")           # 27.50 * 1.30, NO 39.00


@pytest.mark.django_db
def test_el_movimiento_registra_el_promedio_resultante(supplier, categoria):
    helice = Product.objects.create(sku="HEL3", name="Hélice", category=categoria)

    _comprar(supplier, helice, "10", "20", "50")
    _comprar(supplier, helice, "10", "20", "100")

    movimientos = list(
        InventoryMovement.objects.filter(
            product=helice, movement_type=InventoryMovement.MovementType.PURCHASE_IN
        ).order_by("id")
    )
    assert [m.average_cost_after for m in movimientos] == [
        Decimal("25.00"),
        Decimal("27.50"),
    ]


@pytest.mark.django_db
def test_el_movimiento_apunta_a_su_linea_de_compra(supplier, categoria):
    helice = Product.objects.create(sku="HEL4", name="Hélice", category=categoria)
    _, line = _comprar(supplier, helice, "10", "20", "50")

    movimiento = InventoryMovement.objects.get(
        product=helice, movement_type=InventoryMovement.MovementType.PURCHASE_IN
    )
    assert movimiento.purchase_order_line_id == line.id
    assert movimiento.unit_cost == Decimal("25.0000")


@pytest.mark.django_db
def test_stock_en_cero_reinicia_el_promedio(supplier, categoria):
    """Sin existencias, la nueva compra fija el promedio sin arrastrar el anterior."""
    p = Product.objects.create(sku="HEL5", name="P", category=categoria)
    _comprar(supplier, p, "10", "20", "50")
    p.refresh_from_db()
    p.stock_quantity = Decimal("0")
    p.save(update_fields=["stock_quantity"])

    _comprar(supplier, p, "5", "40", "0")
    p.refresh_from_db()
    assert p.average_cost == Decimal("40.00")


@pytest.mark.django_db
def test_recepcion_parcial_solo_promedia_lo_recibido(supplier, categoria):
    p = Product.objects.create(sku="HEL6", name="P", category=categoria)
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal("0")
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        product=p,
        quantity_ordered=Decimal("10"),
        unit_purchase_cost=Decimal("50"),
    )
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("4")}])
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("4.00")
    assert p.average_cost == Decimal("50.00")
    po.refresh_from_db()
    assert po.status == PurchaseOrder.Status.PARTIALLY_RECEIVED
