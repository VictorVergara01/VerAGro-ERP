from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product
from apps.inventory.services import effective_margin
from apps.suppliers.models import SupplierProduct

from .models import PurchaseOrder

CENT = Decimal("0.01")
UNIT = Decimal("0.0001")


def _q(value, exp=CENT):
    return Decimal(value).quantize(exp, rounding=ROUND_HALF_UP)


def recalculate_costs(purchase_order):
    """Recalcula los derivados de costeo de la orden (doc §5.6).

    Distribuye envío + costos adicionales proporcionalmente al valor de cada
    línea, calcula el costo unitario real (landed) y el precio de venta sugerido.
    El residuo de redondeo se asigna a la última línea para que la suma de los
    costos asignados sea exacta. El margen/precio de venta ya no se calcula aquí:
    el precio vive en inventario (margen por producto/categoría) y se fija al recibir.
    """
    lines = list(purchase_order.lines.all())
    additional_costs = list(purchase_order.additional_costs.all())

    additional_amount = sum((c.amount for c in additional_costs), Decimal("0"))
    additional_total = purchase_order.shipping_cost + additional_amount

    products_subtotal = Decimal("0")
    for line in lines:
        line.line_subtotal = _q(line.quantity_ordered * line.unit_purchase_cost)
        products_subtotal += line.line_subtotal

    allocated_running = Decimal("0")
    for index, line in enumerate(lines):
        if products_subtotal > 0:
            ratio = line.line_subtotal / products_subtotal
            allocated = _q(additional_total * ratio)
        else:
            allocated = Decimal("0.00")

        # Residuo de redondeo a la última línea: Σ allocated == additional_total.
        if index == len(lines) - 1 and products_subtotal > 0:
            allocated = _q(additional_total - allocated_running)
        allocated_running += allocated

        line.allocated_extra_cost = allocated
        landed_total = line.line_subtotal + allocated
        if line.quantity_ordered > 0:
            line.landed_unit_cost = _q(landed_total / line.quantity_ordered, UNIT)
        else:
            line.landed_unit_cost = Decimal("0.0000")

        line.save(
            update_fields=[
                "line_subtotal",
                "allocated_extra_cost",
                "landed_unit_cost",
                "updated_at",
            ]
        )

    purchase_order.subtotal_products = products_subtotal
    purchase_order.additional_costs_total = _q(additional_amount)
    purchase_order.grand_total = _q(
        products_subtotal + purchase_order.shipping_cost + additional_amount
    )
    purchase_order.save(
        update_fields=[
            "subtotal_products",
            "additional_costs_total",
            "grand_total",
            "updated_at",
        ]
    )
    return purchase_order


@transaction.atomic
def receive_lines(*, purchase_order, receipts, user=None):
    """Registra la recepción (parcial o total) de líneas de una orden.

    ``receipts`` es una lista de dicts ``{"line": <id>, "quantity": <Decimal>}``.
    Atómico: por cada línea crea un movimiento ``purchase_in`` y actualiza el
    producto (stock, costo promedio ponderado móvil, último costo, precio de
    venta). Bloquea sobre-recepción y transiciona el estado de la orden.
    """
    if purchase_order.status not in (
        PurchaseOrder.Status.SENT,
        PurchaseOrder.Status.PARTIALLY_RECEIVED,
    ):
        raise ValidationError(
            {"status": "Solo se puede recibir una orden enviada o parcialmente recibida."}
        )

    # Costos vigentes antes de mover inventario.
    recalculate_costs(purchase_order)

    lines_by_id = {line.id: line for line in purchase_order.lines.all()}

    # Validación previa (no se mueve inventario si algún receipt es inválido).
    parsed = []
    for receipt in receipts:
        line = lines_by_id.get(receipt.get("line"))
        if line is None:
            raise ValidationError(
                {"line": f"La línea {receipt.get('line')} no pertenece a la orden."}
            )
        quantity = Decimal(str(receipt.get("quantity", 0)))
        if quantity <= 0:
            raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})
        pending = line.quantity_ordered - line.quantity_received
        if quantity > pending:
            raise ValidationError(
                {
                    "quantity": (
                        f"La línea {line.id} solo tiene {pending} pendientes de recibir."
                    )
                }
            )
        parsed.append((line, quantity))

    for line, quantity in parsed:
        cost = line.landed_unit_cost
        product = Product.objects.select_for_update().get(pk=line.product_id)

        new_stock = product.stock_quantity + quantity
        if new_stock > 0:
            product.average_cost = _q(
                (product.stock_quantity * product.average_cost + quantity * cost)
                / new_stock
            )
        product.stock_quantity = new_stock
        product.last_purchase_cost = _q(cost)
        # Precio de venta: margen vive en inventario (producto o categoría).
        margin = effective_margin(product)
        product.sale_price = _q(cost * (Decimal("1") + margin / Decimal("100")))
        # Primera compra del producto: el proveedor de la orden queda como principal.
        if product.main_supplier_id is None:
            product.main_supplier_id = purchase_order.supplier_id
        product.save(
            update_fields=[
                "stock_quantity",
                "average_cost",
                "last_purchase_cost",
                "sale_price",
                "main_supplier",
                "updated_at",
            ]
        )

        InventoryMovement.objects.create(
            product=product,
            movement_type=InventoryMovement.MovementType.PURCHASE_IN,
            quantity=quantity,
            unit_cost=_q(cost),
            reference_type="purchase_order",
            reference_id=purchase_order.id,
            notes=f"Recepción orden {purchase_order.order_number}",
            created_by=user,
        )

        # Cierra el lazo con Proveedores: crea o actualiza la relación con su costo.
        SupplierProduct.objects.update_or_create(
            supplier_id=purchase_order.supplier_id,
            product_id=line.product_id,
            defaults={"last_cost": line.unit_purchase_cost},
        )

        line.quantity_received += quantity
        line.save(update_fields=["quantity_received", "updated_at"])

    fresh_lines = purchase_order.lines.all()
    if all(l.quantity_received >= l.quantity_ordered for l in fresh_lines):
        purchase_order.status = PurchaseOrder.Status.RECEIVED
    else:
        purchase_order.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
    purchase_order.save(update_fields=["status", "updated_at"])
    return purchase_order
