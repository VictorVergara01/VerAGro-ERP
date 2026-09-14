"""Seed idempotente del catálogo técnico: DJI Agras T50 y DJI D12500iE.

Reejecutable sin duplicar (get_or_create por claves naturales). NO crea
compatibilidades de productos (se registran manualmente).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent

# Árbol como lista de (code, name, type, [hijos...]). type: "assembly"|"position".
A, P = "assembly", "position"

D12500_TREE = [
    ("engine", "Motor", A, [
        ("ign_system", "Sistema de encendido", A, [
            ("spark_plug", "Bujía", P, []),
        ]),
        ("air_filter", "Filtro de aire", P, []),
        ("start_system", "Sistema de arranque", P, []),
        ("intake", "Admisión", P, []),
        ("exhaust", "Escape", P, []),
    ]),
    ("fuel", "Sistema de combustible", A, [
        ("fuel_tank", "Tanque", P, []),
        ("fuel_hoses", "Mangueras", P, []),
        ("fuel_filter", "Filtro de combustible", P, []),
        ("fuel_pump", "Bomba de combustible", P, []),
    ]),
    ("electrical", "Sistema eléctrico", A, [
        ("alternator", "Alternador", P, []),
        ("regulator", "Regulador", P, []),
        ("inverter", "Módulo inversor", P, []),
        ("start_battery", "Batería de arranque", P, []),
        ("fuses", "Fusibles", P, []),
        ("wiring", "Cableado", P, []),
    ]),
    ("cooling", "Refrigeración", A, [
        ("fan", "Ventilador", P, []),
        ("ducts", "Conductos", P, []),
        ("temp_sensor", "Sensor de temperatura", P, []),
    ]),
    ("control_panel", "Panel de control", A, [
        ("screen", "Pantalla", P, []),
        ("switches", "Interruptores", P, []),
        ("outlets", "Tomas de salida", P, []),
        ("panel_connectors", "Conectores", P, []),
    ]),
    ("structure", "Estructura", A, [
        ("chassis", "Chasis", P, []),
        ("covers", "Cubiertas", P, []),
        ("mounts", "Soportes", P, []),
        ("dampers", "Amortiguadores", P, []),
    ]),
]


def _build(model, nodes, parent=None, order_start=0):
    for i, (code, name, ctype, children) in enumerate(nodes):
        comp, _ = EquipmentComponent.objects.get_or_create(
            equipment_model=model,
            code=code,
            defaults={
                "name": name,
                "component_type": ctype,
                "parent": parent,
                "diagram_key": code,
                "sort_order": order_start + i,
            },
        )
        _build(model, children, parent=comp)


class Command(BaseCommand):
    help = "Siembra el catálogo técnico DJI Agras T50 y DJI D12500iE (idempotente)."

    @transaction.atomic
    def handle(self, *args, **options):
        # La migración equipment.0005 ya crea ambos modelos con su tipo propio;
        # estos get_or_create solo actúan en una base sin esa migración.
        drone, _ = EquipmentType.objects.get_or_create(name="Agras T50")
        planta, _ = EquipmentType.objects.get_or_create(name="Planta D12500iE")

        t50, _ = EquipmentModel.objects.get_or_create(
            brand="DJI", model_code="T50", revision="",
            defaults={"equipment_type": drone, "name": "DJI Agras T50"},
        )
        d125, _ = EquipmentModel.objects.get_or_create(
            brand="DJI", model_code="D12500IE", revision="",
            defaults={"equipment_type": planta, "name": "DJI D12500iE"},
        )
        _build(d125, D12500_TREE)
        self.stdout.write(self.style.SUCCESS("Modelos sembrados (T50 sin árbol: usar import_agras_t50_parts; D12500iE con árbol)."))
