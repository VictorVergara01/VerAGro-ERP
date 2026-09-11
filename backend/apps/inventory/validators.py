from decimal import Decimal

MSG_MIN_OVER_MAX = "El margen mínimo no puede superar al máximo."
MSG_MIN_OVER_TARGET = "El margen mínimo no puede superar al objetivo."
MSG_TARGET_OVER_MAX = "El margen objetivo no puede superar al máximo."


def _value(raw):
    """Normaliza a Decimal. None o 0 significan 'no configurado'."""
    if raw is None:
        return Decimal("0")
    return Decimal(str(raw))


def margin_triplet_errors(minimum, target, maximum):
    """Valida el trío de márgenes y devuelve {campo: mensaje}; {} si es válido.

    Un margen en 0 (o None) significa "no configurado": hereda de la categoría y
    no participa en las comparaciones. Por eso sólo se comparan los pares en que
    ambos valores están configurados.
    """
    minimum, target, maximum = _value(minimum), _value(target), _value(maximum)
    errors = {}
    if minimum > 0 and maximum > 0 and minimum > maximum:
        errors["min_margin_percentage"] = MSG_MIN_OVER_MAX
    if minimum > 0 and target > 0 and minimum > target:
        errors["min_margin_percentage"] = MSG_MIN_OVER_TARGET
    if maximum > 0 and target > 0 and target > maximum:
        errors["max_margin_percentage"] = MSG_TARGET_OVER_MAX
    return errors


def margin_errors_for(attrs, instance):
    """Valida el trío de márgenes de un serializer.

    Para cada uno de los tres campos, usa el valor entrante en `attrs` si está
    presente; si no, cae al valor actual de `instance` (0 si no hay instancia,
    es decir, en creación). Comparten esta resolución tanto `ProductSerializer`
    como `ProductCategorySerializer`.
    """

    def field(name):
        return attrs.get(name, getattr(instance, name, 0) if instance else 0)

    return margin_triplet_errors(
        field("min_margin_percentage"),
        field("default_margin_percentage"),
        field("max_margin_percentage"),
    )
