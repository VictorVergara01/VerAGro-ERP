"""Seed idempotente del catálogo técnico: DJI Agras T50 y DJI D12500iE.

Reejecutable sin duplicar (get_or_create por claves naturales). NO crea
compatibilidades de productos (se registran manualmente).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent

# Árbol como lista de (code, name, type, [hijos...]). type: "assembly"|"position".
A, P = "assembly", "position"

T50_TREE = [
    ("propulsion", "Sistema de propulsión", A, [
        ("arm_m1", "Brazo M1", A, [
            ("motor_m1", "Motor M1", P, []),
            ("esc_m1", "ESC M1", P, []),
            ("cable_esc_m1", "Cable ESC M1", P, []),
            ("prop_m1", "Hélice M1", P, []),
        ]),
        ("arm_m2", "Brazo M2", A, [
            ("motor_m2", "Motor M2", P, []),
            ("esc_m2", "ESC M2", P, []),
            ("cable_esc_m2", "Cable ESC M2", P, []),
            ("prop_m2", "Hélice M2", P, []),
        ]),
        ("arm_m3", "Brazo M3", A, [
            ("motor_m3", "Motor M3", P, []),
            ("esc_m3", "ESC M3", P, []),
            ("cable_esc_m3", "Cable ESC M3", P, []),
            ("prop_m3", "Hélice M3", P, []),
        ]),
        ("arm_m4", "Brazo M4", A, [
            ("motor_m4", "Motor M4", P, []),
            ("esc_m4", "ESC M4", P, []),
            ("cable_esc_m4", "Cable ESC M4", P, []),
            ("prop_m4", "Hélice M4", P, []),
        ]),
    ]),
    ("spray", "Sistema de pulverización", A, [
        ("spray_tank", "Tanque", P, []),
        ("spray_pump", "Bomba", P, []),
        ("spray_flowmeter", "Caudalímetro", P, []),
        ("spray_atomizer_left", "Atomizador izquierdo", P, []),
        ("spray_atomizer_right", "Atomizador derecho", P, []),
        ("spray_hoses", "Mangueras", P, []),
        ("spray_valves", "Válvulas", P, []),
    ]),
    ("electrical", "Sistema eléctrico", A, [
        ("elec_power_dist", "Distribución de potencia", P, []),
        ("elec_battery_port", "Puerto de batería", P, []),
        ("elec_main_wiring", "Cableado principal", P, []),
        ("elec_connectors", "Conectores", P, []),
    ]),
    ("navigation", "Navegación y seguridad", A, [
        ("nav_radar", "Radar", P, []),
        ("nav_fpv", "Cámara FPV", P, []),
        ("nav_antennas", "Antenas", P, []),
        ("nav_rtk", "Módulo RTK", P, []),
    ]),
    ("structure", "Estructura", A, [
        ("struct_frame", "Chasis central", P, []),
        ("struct_landing", "Tren de aterrizaje", P, []),
        ("struct_covers", "Cubiertas", P, []),
        ("struct_mounts", "Soportes", P, []),
    ]),
    ("spreading", "Sistema de esparcimiento", A, [
        ("spread_hopper", "Tolva", P, []),
        ("spread_motor", "Motor del esparcidor", P, []),
        ("spread_disc", "Disco", P, []),
        ("spread_weight_sensor", "Sensor de peso", P, []),
    ]),
]

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
        drone, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
        planta, _ = EquipmentType.objects.get_or_create(name="Planta eléctrica")

        t50, _ = EquipmentModel.objects.get_or_create(
            brand="DJI", model_code="T50", revision="",
            defaults={"equipment_type": drone, "name": "DJI Agras T50"},
        )
        d125, _ = EquipmentModel.objects.get_or_create(
            brand="DJI", model_code="D12500IE", revision="",
            defaults={"equipment_type": planta, "name": "DJI D12500iE"},
        )
        _build(t50, T50_TREE)
        _build(d125, D12500_TREE)
        self.stdout.write(self.style.SUCCESS("Catálogo técnico sembrado (T50 + D12500iE)."))
