import math
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import FieldJob


@transaction.atomic
def mark_done(job, user=None, *, actual_hectares=None, applied_quintals=None, done_date=None, due_date=None):
    from .serializers import FieldJobCompletionSerializer

    FieldJob.objects.select_for_update().get(pk=job.pk)
    job.refresh_from_db()
    if job.status != FieldJob.Status.SCHEDULED:
        raise ValidationError(
            {"status": "Solo se marca hecho un trabajo programado (scheduled)."}
        )
    data = {"actual_hectares": actual_hectares, "applied_quintals": applied_quintals}
    if done_date is not None:
        data["done_date"] = done_date
    if due_date is not None:
        data["due_date"] = due_date
    completion = FieldJobCompletionSerializer(data=data, context={"job": job})
    completion.is_valid(raise_exception=True)
    job.actual_hectares = completion.validated_data["actual_hectares"]
    job.applied_quintals = completion.validated_data.get("applied_quintals")
    job.status = FieldJob.Status.DONE
    job.done_date = completion.validated_data.get("done_date", timezone.localdate())
    job.due_date = completion.validated_data.get('due_date') or job.due_date or (job.done_date + timedelta(days=10))
    if job.due_date < job.done_date:
        raise ValidationError({'due_date': 'El vencimiento no puede ser anterior al trabajo.'})
    job.recalculate_total()
    job.save(update_fields=["actual_hectares", "applied_quintals", "status", "done_date", "due_date", "total", "updated_at"])
    from .finance import accrue_pilot
    accrue_pilot(job)
    return job


@transaction.atomic
def cancel_job(job, user=None):
    FieldJob.objects.select_for_update().get(pk=job.pk)
    job.refresh_from_db()
    if job.collections.exists():
        raise ValidationError({'status': 'El trabajo tiene cobros registrados y no se puede cancelar.'})
    from .models import PilotEarning
    earning = PilotEarning.objects.select_for_update().filter(job=job).first()
    if earning and earning.payment_id:
        raise ValidationError({"status": "El piloto ya recibió el pago de este trabajo."})
    if job.status == FieldJob.Status.INVOICED:
        raise ValidationError(
            {"status": "No se puede cancelar un trabajo ya facturado."}
        )
    job.status = FieldJob.Status.CANCELLED
    if earning:
        earning.delete()
    job.save(update_fields=["status", "updated_at"])
    return job


_UNIT_BASE = {
    "L/ha": ("L", 1.0),
    "cc/ha": ("L", 0.001),
    "kg/ha": ("kg", 1.0),
    "g/ha": ("kg", 0.001),
}


def calculate_mix(*, hectares, caldo_per_hectare, tank_volume_liters, products):
    if hectares is None or float(hectares) <= 0:
        raise ValidationError({"hectares": "Debe ser mayor que cero."})
    if caldo_per_hectare is None or float(caldo_per_hectare) <= 0:
        raise ValidationError({"caldo_per_hectare": "Debe ser mayor que cero."})
    if tank_volume_liters is None or float(tank_volume_liters) <= 0:
        raise ValidationError({"tank_volume_liters": "Debe ser mayor que cero."})
    if not products:
        raise ValidationError({"products": "Agregue al menos un producto."})

    hectares = float(hectares)
    caldo = float(caldo_per_hectare)
    tank = float(tank_volume_liters)
    total_caldo = hectares * caldo

    # (nombre, cantidad_base, unidad_base) por producto
    items = []
    for product in products:
        dose = product.get("dose_per_hectare")
        if dose is None or float(dose) <= 0:
            raise ValidationError(
                {"products": "Cada producto necesita dose_per_hectare > 0."}
            )
        unit = product.get("unit")
        if unit not in _UNIT_BASE:
            raise ValidationError({"products": f"Unidad inválida: {unit}."})
        base_unit, factor = _UNIT_BASE[unit]
        base_qty = float(dose) * hectares * factor
        items.append((product.get("name", ""), base_qty, base_unit))

    liquid_chemical = sum(qty for _, qty, base_unit in items if base_unit == "L")
    water = max(0.0, total_caldo - liquid_chemical)

    tanks_needed = math.ceil(total_caldo / tank)
    last_tank_liters = round(total_caldo - (tanks_needed - 1) * tank, 4)
    if abs(last_tank_liters - tank) < 1e-9:
        full_tanks = tanks_needed
        last_tank_liters = 0.0
    else:
        full_tanks = tanks_needed - 1

    def _loads(fraction):
        return [
            {"name": name, "quantity": round(qty * fraction, 3), "unit": base_unit}
            for name, qty, base_unit in items
        ]

    def _water_for(fill_liters):
        liquid_in = liquid_chemical * (fill_liters / total_caldo) if total_caldo else 0.0
        return round(max(0.0, fill_liters - liquid_in), 3)

    return {
        "total_caldo_liters": round(total_caldo, 3),
        "liquid_chemical_liters": round(liquid_chemical, 3),
        "water_liters": round(water, 3),
        "tanks_needed": tanks_needed,
        "full_tanks": full_tanks,
        "last_tank_liters": last_tank_liters,
        "products_total": [
            {"name": name, "quantity": round(qty, 3), "unit": base_unit}
            for name, qty, base_unit in items
        ],
        "per_full_tank": _loads(tank / total_caldo) if full_tanks > 0 else [],
        "water_per_full_tank": _water_for(tank) if full_tanks > 0 else 0.0,
        "last_tank": _loads(last_tank_liters / total_caldo) if last_tank_liters > 0 else [],
        "water_last_tank": _water_for(last_tank_liters) if last_tank_liters > 0 else 0.0,
    }
