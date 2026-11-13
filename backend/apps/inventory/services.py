from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import InventoryMovement, Product, InitialStockCount

ADJUSTMENT_TYPES = {
    InventoryMovement.MovementType.ADJUSTMENT_IN,
    InventoryMovement.MovementType.ADJUSTMENT_OUT,
}

_CENT = Decimal("0.01")


def _q(value):
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def apply_weighted_average(locked_product, quantity_in, unit_cost):
    """Promedio móvil ponderado para entradas posteriores al saldo inicial.

    Recibe el producto YA bloqueado con select_for_update(): no abre transacción ni
    bloquea por su cuenta, eso es responsabilidad del llamador.

    Debe llamarse ANTES de actualizar stock_quantity: usa el stock previo como peso
    del costo acumulado. Muta el objeto en memoria y devuelve el nuevo promedio; no
    guarda (el llamador ya hace un save() con su propio update_fields).
    """
    quantity_in = Decimal(str(quantity_in))
    unit_cost = Decimal(str(unit_cost))
    new_stock = locked_product.stock_quantity + quantity_in
    if new_stock > 0:
        locked_product.average_cost = _q(
            (locked_product.stock_quantity * locked_product.average_cost
             + quantity_in * unit_cost)
            / new_stock
        )
    return locked_product.average_cost


def generate_product_sku(pk):
    """SKU autogenerado: prefijo fijo + pk con relleno de ceros a 6 dígitos."""
    return f"SKU-{pk:06d}"


@transaction.atomic
def record_initial_count(*, product, quantity, unit_cost=None, location="", notes="", expected_updated_at, user=None):
    locked = Product.objects.select_for_update().get(pk=product.pk)
    if not locked.is_active:
        raise ValidationError({"product": "El producto está inactivo."})
    if InitialStockCount.objects.filter(product=locked).exists():
        raise ValidationError({"product": "Este producto ya tiene un conteo inicial. Para cambios posteriores usa los ajustes de inventario."})
    if locked.updated_at != expected_updated_at:
        raise ValidationError({"detail": "El producto cambió mientras contabas. Cierra el formulario y vuelve a abrirlo para revisar sus existencias."})
    quantity = Decimal(str(quantity))
    if not quantity.is_finite() or quantity < 0:
        raise ValidationError({"quantity": "La cantidad contada debe ser cero o mayor."})
    cost = Decimal(str(unit_cost)) if unit_cost is not None else None
    if cost is not None and (not cost.is_finite() or cost <= 0):
        raise ValidationError({"unit_cost": "El costo unitario debe ser mayor que cero."})
    if quantity > 0 and cost is None:
        raise ValidationError({"unit_cost": "Indica el costo unitario para valorar las existencias contadas."})
    if quantity < locked.reserved_quantity:
        raise ValidationError({"quantity": "La cantidad contada es menor que las piezas reservadas. Revisa las reservas antes de guardar."})

    previous_quantity = locked.stock_quantity
    previous_cost = locked.average_cost
    count = InitialStockCount.objects.create(
        product=locked, quantity_before=previous_quantity, counted_quantity=quantity,
        reserved_quantity=locked.reserved_quantity, average_cost_before=previous_cost,
        unit_cost=cost, location=location, notes=notes, created_by=user,
    )
    locked.stock_quantity = quantity
    locked.location = location
    if quantity > 0:
        # La apertura establece la base de valoración del conteo físico.
        locked.average_cost = cost
    locked.save(update_fields=["stock_quantity", "location", "average_cost", "updated_at"])
    if quantity > 0:
        apply_margin(locked)
    difference = quantity - previous_quantity
    if difference:
        movement = InventoryMovement.objects.create(
            product=locked, movement_type="adjustment_in" if difference > 0 else "adjustment_out",
            quantity=abs(difference), unit_cost=cost if difference > 0 else previous_cost,
            average_cost_after=locked.average_cost, reference_type="initial_count", reference_id=count.pk,
            notes="Conteo físico inicial" + (f": {notes}" if notes else ""), created_by=user,
        )
        count.movement = movement
        count.save(update_fields=["movement", "updated_at"])
    return count


def effective_margins(product):
    """(mínimo, objetivo, máximo) con cascada producto → categoría → 0.

    La cascada se resuelve campo por campo: un producto puede definir su mínimo
    y heredar el máximo de su categoría. Un margen en 0 significa "no configurado".
    """
    category = product.category

    def pick(own_value, category_attr):
        if own_value and own_value > 0:
            return own_value
        if category is not None:
            inherited = getattr(category, category_attr, None)
            if inherited and inherited > 0:
                return inherited
        return Decimal("0")

    return (
        pick(product.min_margin_percentage, "min_margin_percentage"),
        pick(product.default_margin_percentage, "default_margin_percentage"),
        pick(product.max_margin_percentage, "max_margin_percentage"),
    )


def effective_margin(product):
    """Margen objetivo efectivo. Envoltorio de effective_margins() para llamadores previos."""
    return effective_margins(product)[1]


def _price_at(base_cost, margin):
    return _q(base_cost * (Decimal("1") + margin / Decimal("100")))


def apply_margin(product):
    """Recalcula el trío de precios sobre average_cost y guarda.

    Sin costo base (average_cost <= 0) no se puede derivar el precio: se respeta el
    precio manual y no se toca nada (el precio se fijará al recibir la primera compra).
    Si un margen del rango está sin configurar, su precio iguala al sugerido: el
    rango colapsa a un punto y el comportamiento es el previo a esta función.
    """
    if not product.average_cost or product.average_cost <= 0:
        return product
    minimum, target, maximum = effective_margins(product)
    base = product.average_cost
    product.sale_price = _price_at(base, target)
    product.min_sale_price = _price_at(base, minimum) if minimum > 0 else product.sale_price
    product.max_sale_price = _price_at(base, maximum) if maximum > 0 else product.sale_price
    product.save(
        update_fields=["sale_price", "min_sale_price", "max_sale_price", "updated_at"]
    )
    return product


def apply_category_margin(category):
    """Recalcula el rango de precios de todos los productos de la categoría.

    No se filtra por "sin margen propio": con tres márgenes un producto puede
    heredar unos y definir otros. apply_margin() respeta los propios vía
    effective_margins(), así que recalcular todos da el resultado correcto.
    """
    for product in category.products.all():
        apply_margin(product)


@transaction.atomic
def apply_adjustment(*, product, movement_type, quantity, unit_cost=0, notes="", user=None):
    """Aplica un ajuste manual de stock de forma atómica.

    Solo admite adjustment_in / adjustment_out. quantity debe ser > 0.

    La entrada exige unit_cost > 0 y alimenta el costo promedio ponderado igual
    que una recepción de compra: si no, cargar mercancía por ajuste dejaría el
    promedio desactualizado y el precio de venta mal derivado.

    La salida no altera el promedio; se valoriza al promedio vigente.
    adjustment_out no puede dejar el stock disponible en negativo.
    """
    if movement_type not in ADJUSTMENT_TYPES:
        raise ValidationError(
            {"movement_type": "Solo se permiten ajustes (adjustment_in/adjustment_out)."}
        )
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    is_entry = movement_type == InventoryMovement.MovementType.ADJUSTMENT_IN
    unit_cost = Decimal(str(unit_cost or 0))
    if is_entry and unit_cost <= 0:
        raise ValidationError(
            {"unit_cost": "La entrada por ajuste requiere el costo unitario: alimenta el costo promedio."}
        )

    locked = Product.objects.select_for_update().get(pk=product.pk)

    if is_entry:
        # El promedio se calcula ANTES de mover el stock: usa el stock previo como peso.
        average_after = apply_weighted_average(locked, quantity, unit_cost)
        locked.stock_quantity = locked.stock_quantity + quantity
        movement_cost = unit_cost
    else:
        if quantity > locked.available_quantity:
            raise ValidationError(
                {"quantity": "El ajuste dejaría el stock disponible en negativo."}
            )
        locked.stock_quantity = locked.stock_quantity - quantity
        # La salida se valoriza al promedio vigente y no lo altera.
        movement_cost = locked.average_cost
        average_after = locked.average_cost

    # updated_at es auto_now pero NO se actualiza si se omite de update_fields.
    locked.save(update_fields=["stock_quantity", "average_cost", "updated_at"])
    if is_entry:
        apply_margin(locked)

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=movement_cost,
        average_cost_after=average_after,
        notes=notes or "",
        created_by=user,
    )


@transaction.atomic
def reserve_stock(
    *, product, quantity, reference_type="", reference_id=None, notes="", user=None
):
    """Reserva stock disponible de un producto (no descuenta stock físico).

    Incrementa reserved_quantity y registra un movimiento ``reservation``.
    Falla si la cantidad supera el disponible (stock − reservado).
    """
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)
    if quantity > locked.available_quantity:
        raise ValidationError(
            {"quantity": "No hay stock disponible suficiente para reservar."}
        )
    locked.reserved_quantity = locked.reserved_quantity + quantity
    locked.save(update_fields=["reserved_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=InventoryMovement.MovementType.RESERVATION,
        quantity=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes or "",
        created_by=user,
    )


@transaction.atomic
def release_reservation(
    *, product, quantity, reference_type="", reference_id=None, notes="", user=None
):
    """Libera una reserva previa (devuelve disponibilidad, no toca stock físico).

    Decrementa reserved_quantity (sin bajar de 0) y registra ``reservation_release``.
    """
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)
    released = min(quantity, locked.reserved_quantity)
    locked.reserved_quantity = locked.reserved_quantity - released
    locked.save(update_fields=["reserved_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=InventoryMovement.MovementType.RESERVATION_RELEASE,
        quantity=released,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes or "",
        created_by=user,
    )


@transaction.atomic
def consume_stock(
    *,
    product,
    quantity,
    was_reserved=False,
    unit_cost=0,
    movement_type=InventoryMovement.MovementType.SERVICE_OUT,
    reference_type="",
    reference_id=None,
    notes="",
    user=None,
):
    """Descuenta stock físico por consumo (servicio) o venta directa.

    Decrementa stock_quantity (guard de no-negativo). Si la pieza estaba
    reservada, también libera la reserva (reserved_quantity -= quantity).
    Registra un movimiento de salida (``service_out`` por defecto; ``sale_out``
    para ventas directas).
    """
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)
    limit = locked.stock_quantity if was_reserved else locked.available_quantity
    if quantity > limit:
        raise ValidationError({"quantity": "Stock insuficiente para el consumo."})
    locked.stock_quantity = locked.stock_quantity - quantity
    if was_reserved:
        released = min(quantity, locked.reserved_quantity)
        locked.reserved_quantity = locked.reserved_quantity - released
    locked.save(update_fields=["stock_quantity", "reserved_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=unit_cost or 0,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes or "",
        created_by=user,
    )
