import math

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import FieldJob


@transaction.atomic
def mark_done(job, user=None):
    if job.status != FieldJob.Status.SCHEDULED:
        raise ValidationError(
            {"status": "Solo se marca hecho un trabajo programado (scheduled)."}
        )
    job.status = FieldJob.Status.DONE
    job.done_date = timezone.localdate()
    job.save(update_fields=["status", "done_date", "updated_at"])
    from apps.notifications.services import notify_completed

    notify_completed(job)
    return job


@transaction.atomic
def cancel_job(job, user=None):
    if job.status == FieldJob.Status.INVOICED:
        raise ValidationError(
            {"status": "No se puede cancelar un trabajo ya facturado."}
        )
    job.status = FieldJob.Status.CANCELLED
    job.save(update_fields=["status", "updated_at"])
    return job


def _unit_label(dose_unit):
    # "mL/L" -> "mL", "cc/L" -> "cc"
    return dose_unit.split("/")[0] if dose_unit else ""


def calculate_spray_mix(*, hectares, water_per_hectare, tank_volume_liters, products):
    if hectares is None or float(hectares) <= 0:
        raise ValidationError({"hectares": "Debe ser mayor que cero."})
    if water_per_hectare is None or float(water_per_hectare) <= 0:
        raise ValidationError({"water_per_hectare": "Debe ser mayor que cero."})
    if tank_volume_liters is None or float(tank_volume_liters) <= 0:
        raise ValidationError({"tank_volume_liters": "Debe ser mayor que cero."})
    if not products:
        raise ValidationError({"products": "Agregue al menos un producto."})

    hectares = float(hectares)
    water_per_hectare = float(water_per_hectare)
    tank = float(tank_volume_liters)

    total_volume = hectares * water_per_hectare
    fills_needed = math.ceil(total_volume / tank)
    last_fill_liters = round(total_volume - (fills_needed - 1) * tank, 4)
    # Si el total es múltiplo exacto del tanque, no hay llenado parcial.
    if abs(last_fill_liters - tank) < 1e-9:
        full_fills = fills_needed
        last_fill_liters = 0.0
    else:
        full_fills = fills_needed - 1

    per_full_fill, last_fill = [], []
    for product in products:
        dose = product.get("dose_per_liter")
        if dose is None or float(dose) <= 0:
            raise ValidationError(
                {"products": "Cada producto necesita dose_per_liter > 0."}
            )
        dose = float(dose)
        unit = _unit_label(product.get("dose_unit", ""))
        per_full_fill.append(
            {"name": product.get("name", ""), "quantity": round(tank * dose, 4), "unit": unit}
        )
        if last_fill_liters > 0:
            last_fill.append(
                {
                    "name": product.get("name", ""),
                    "quantity": round(last_fill_liters * dose, 4),
                    "unit": unit,
                }
            )

    return {
        "total_volume_liters": round(total_volume, 4),
        "fills_needed": fills_needed,
        "full_fills": full_fills,
        "last_fill_liters": last_fill_liters,
        "per_full_fill": per_full_fill,
        "last_fill": last_fill,
    }
