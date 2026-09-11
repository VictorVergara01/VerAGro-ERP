from decimal import Decimal

from rest_framework import serializers


def floor_for(product):
    """Piso de venta vigente del producto, o None si no tiene rango configurado."""
    if product is None:
        return None
    minimum = product.min_sale_price
    if not minimum or minimum <= 0:
        return None
    return minimum


def is_below_floor(product, unit_price):
    """True si el precio está por debajo del piso vigente.

    El juicio se hace contra el rango ACTUAL del producto, no contra el que regía
    al momento de la venta: dice qué está bajo el costo hoy. Congelarlo exigiría
    columnas nuevas en cada modelo de línea.
    """
    minimum = floor_for(product)
    if minimum is None or unit_price is None:
        return False
    return Decimal(str(unit_price)) < minimum


class PriceFloorMixin(serializers.Serializer):
    """Aporta price_floor y below_min_price a una línea con product y unit_price.

    No bloquea la venta: sólo informa, para que la UI pueda marcar la línea.
    """

    price_floor = serializers.SerializerMethodField()
    below_min_price = serializers.SerializerMethodField()

    def get_price_floor(self, obj):
        minimum = floor_for(getattr(obj, "product", None))
        return None if minimum is None else str(minimum)

    def get_below_min_price(self, obj):
        return is_below_floor(getattr(obj, "product", None), getattr(obj, "unit_price", None))
