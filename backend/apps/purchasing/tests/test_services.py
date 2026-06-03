from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product
from apps.purchasing.models import (
    PurchaseAdditionalCost,
    PurchaseOrder,
    PurchaseOrderLine,
)
from apps.purchasing.services import receive_lines, recalculate_costs
from apps.suppliers.models import Supplier, SupplierProduct


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="DronesPanama")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


@pytest.mark.django_db
def test_doc_example_proportional_costing(supplier):
    """Reproduce exactamente el ejemplo del doc §5.6."""
    order = PurchaseOrder.objects.create(supplier=supplier, shipping_cost=Decimal("60"))
    helice = _product("HELICE")
    flow = _product("FLOW")
    bomba = _product("BOMBA")
    l_helice = PurchaseOrderLine.objects.create(
        purchase_order=order, product=helice, quantity_ordered=10, unit_purchase_cost=18
    )
    l_flow = PurchaseOrderLine.objects.create(
        purchase_order=order, product=flow, quantity_ordered=2, unit_purchase_cost=45
    )
    l_bomba = PurchaseOrderLine.objects.create(
        purchase_order=order, product=bomba, quantity_ordered=1, unit_purchase_cost=120
    )
    PurchaseAdditionalCost.objects.create(purchase_order=order, name="Aduana", amount=25)
    PurchaseAdditionalCost.objects.create(
        purchase_order=order, name="Transporte interno", amount=15
    )

    recalculate_costs(order)
    for line in (l_helice, l_flow, l_bomba):
        line.refresh_from_db()

    assert order.subtotal_products == Decimal("390.00")
    assert order.additional_costs_total == Decimal("40.00")
    assert order.grand_total == Decimal("490.00")

    # Distribución proporcional (residuo a la última línea, Σ == 100).
    assert l_helice.allocated_extra_cost == Decimal("46.15")
    assert l_flow.allocated_extra_cost == Decimal("23.08")
    assert l_bomba.allocated_extra_cost == Decimal("30.77")
    total_allocated = (
        l_helice.allocated_extra_cost
        + l_flow.allocated_extra_cost
        + l_bomba.allocated_extra_cost
    )
    assert total_allocated == Decimal("100.00")

    # Costo real unitario (landed) — doc: 22.62 / 56.54 / 150.77.
    assert l_helice.landed_unit_cost == Decimal("22.6150")
    assert l_flow.landed_unit_cost == Decimal("56.5400")
    assert l_bomba.landed_unit_cost == Decimal("150.7700")


@pytest.mark.django_db
def test_margin_and_manual_final_price(supplier):
    order = PurchaseOrder.objects.create(supplier=supplier)
    p = _product("M1")
    line = PurchaseOrderLine.objects.create(
        purchase_order=order,
        product=p,
        quantity_ordered=1,
        unit_purchase_cost=100,
        margin_percentage=50,
    )
    recalculate_costs(order)
    line.refresh_from_db()
    assert line.landed_unit_cost == Decimal("100.0000")
    assert line.calculated_sale_price == Decimal("150.00")
    # final_sale_price arranca igual al calculado cuando no se fijó.
    assert line.final_sale_price == Decimal("150.00")

    # Un precio final manual se respeta en recálculos posteriores.
    line.final_sale_price = Decimal("175.00")
    line.save(update_fields=["final_sale_price"])
    recalculate_costs(order)
    line.refresh_from_db()
    assert line.final_sale_price == Decimal("175.00")


@pytest.mark.django_db
def test_zero_subtotal_no_division_error(supplier):
    order = PurchaseOrder.objects.create(supplier=supplier, shipping_cost=Decimal("50"))
    p = _product("Z1")
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=1, unit_purchase_cost=0
    )
    recalculate_costs(order)
    line.refresh_from_db()
    assert line.allocated_extra_cost == Decimal("0.00")
    assert line.landed_unit_cost == Decimal("0.0000")


@pytest.mark.django_db
def test_receive_full_updates_inventory_and_status(supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT
    )
    p = _product("R1", stock_quantity=Decimal("0"))
    line = PurchaseOrderLine.objects.create(
        purchase_order=order,
        product=p,
        quantity_ordered=10,
        unit_purchase_cost=20,
        margin_percentage=25,
    )
    receive_lines(
        purchase_order=order, receipts=[{"line": line.id, "quantity": 10}]
    )
    order.refresh_from_db()
    line.refresh_from_db()
    p.refresh_from_db()

    assert order.status == PurchaseOrder.Status.RECEIVED
    assert line.quantity_received == Decimal("10.00")
    assert p.stock_quantity == Decimal("10.00")
    assert p.last_purchase_cost == Decimal("20.00")
    assert p.sale_price == Decimal("25.00")  # 20 * 1.25
    mov = InventoryMovement.objects.get(product=p)
    assert mov.movement_type == InventoryMovement.MovementType.PURCHASE_IN
    assert mov.quantity == Decimal("10.00")
    assert mov.reference_type == "purchase_order"
    assert mov.reference_id == order.id


@pytest.mark.django_db
def test_receive_partial_then_complete(supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT
    )
    p = _product("R2")
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=10, unit_purchase_cost=5
    )
    receive_lines(purchase_order=order, receipts=[{"line": line.id, "quantity": 4}])
    order.refresh_from_db()
    assert order.status == PurchaseOrder.Status.PARTIALLY_RECEIVED

    receive_lines(purchase_order=order, receipts=[{"line": line.id, "quantity": 6}])
    order.refresh_from_db()
    line.refresh_from_db()
    p.refresh_from_db()
    assert order.status == PurchaseOrder.Status.RECEIVED
    assert line.quantity_received == Decimal("10.00")
    assert p.stock_quantity == Decimal("10.00")
    assert InventoryMovement.objects.filter(product=p).count() == 2


@pytest.mark.django_db
def test_weighted_moving_average_cost(supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT
    )
    p = _product(
        "R3", stock_quantity=Decimal("10"), average_cost=Decimal("5")
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=10, unit_purchase_cost=15
    )
    receive_lines(purchase_order=order, receipts=[{"line": line.id, "quantity": 10}])
    p.refresh_from_db()
    # (10*5 + 10*15) / 20 = 10
    assert p.average_cost == Decimal("10.00")
    assert p.stock_quantity == Decimal("20.00")


@pytest.mark.django_db
def test_over_receipt_blocked(supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT
    )
    p = _product("R4")
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=5, unit_purchase_cost=10
    )
    with pytest.raises(ValidationError):
        receive_lines(
            purchase_order=order, receipts=[{"line": line.id, "quantity": 6}]
        )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("0.00")  # nada se movió
    assert not InventoryMovement.objects.filter(product=p).exists()


@pytest.mark.django_db
def test_receive_from_draft_blocked(supplier):
    order = PurchaseOrder.objects.create(supplier=supplier)  # draft
    p = _product("R5")
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=1, unit_purchase_cost=10
    )
    with pytest.raises(ValidationError):
        receive_lines(
            purchase_order=order, receipts=[{"line": line.id, "quantity": 1}]
        )


@pytest.mark.django_db
def test_receive_updates_supplier_product_last_cost(supplier):
    order = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT
    )
    p = _product("R6")
    sp = SupplierProduct.objects.create(supplier=supplier, product=p, last_cost=0)
    line = PurchaseOrderLine.objects.create(
        purchase_order=order, product=p, quantity_ordered=2, unit_purchase_cost=33
    )
    receive_lines(purchase_order=order, receipts=[{"line": line.id, "quantity": 2}])
    sp.refresh_from_db()
    assert sp.last_cost == Decimal("33.00")
