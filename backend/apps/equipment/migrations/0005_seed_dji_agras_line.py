"""Siembra la línea DJI Agras y las plantas de energía DJI.

Cada modelo queda como tipo de equipo propio (convención ya usada con "Agras T50":
el selector de piezas por modelo filtra por tipo) y como modelo técnico enlazado a
ese tipo. Idempotente: busca por nombre de tipo y por marca+código, así que puede
correr sobre una base que ya tenga alguno. No reactiva tipos que un admin
desactivó ni borra los genéricos ("Drone agrícola", "Planta eléctrica"), que usan
la plantilla de checklist del T50 y equipos antiguos.

El reverso no borra nada: para entonces puede haber equipos usando estos tipos.
"""
from django.db import migrations

BRAND = "DJI"

# (model_code, nombre del modelo técnico, nombre del tipo de equipo)
DRONES = [
    ("MG-1", "DJI Agras MG-1", "Agras MG-1"),
    ("MG-1S", "DJI Agras MG-1S", "Agras MG-1S"),
    ("MG-1S-RTK", "DJI Agras MG-1S RTK", "Agras MG-1S RTK"),
    ("MG-1SA", "DJI Agras MG-1SA", "Agras MG-1SA"),
    ("MG-1P", "DJI Agras MG-1P", "Agras MG-1P"),
    ("MG-1P-RTK", "DJI Agras MG-1P RTK", "Agras MG-1P RTK"),
    ("T10", "DJI Agras T10", "Agras T10"),
    ("T16", "DJI Agras T16", "Agras T16"),
    ("T20", "DJI Agras T20", "Agras T20"),
    ("T20P", "DJI Agras T20P", "Agras T20P"),
    ("T25", "DJI Agras T25", "Agras T25"),
    ("T25P", "DJI Agras T25P", "Agras T25P"),
    ("T30", "DJI Agras T30", "Agras T30"),
    ("T40", "DJI Agras T40", "Agras T40"),
    ("T50", "DJI Agras T50", "Agras T50"),
    ("T55", "DJI Agras T55", "Agras T55"),
    ("T60", "DJI Agras T60", "Agras T60"),
    ("T70", "DJI Agras T70", "Agras T70"),
    ("T70P", "DJI Agras T70P", "Agras T70P"),
    ("T100", "DJI Agras T100", "Agras T100"),
]

PLANTAS = [
    ("D6000I", "DJI D6000i", "Planta D6000i"),
    ("D9000I", "DJI D9000i", "Planta D9000i"),
    ("D12000IE", "DJI D12000iE", "Planta D12000iE"),
    ("D12500IE", "DJI D12500iE", "Planta D12500iE"),
    ("D14000IE", "DJI D14000iE", "Planta D14000iE"),
]


def seed_dji_line(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    EquipmentModel = apps.get_model("equipment", "EquipmentModel")
    Equipment = apps.get_model("equipment", "Equipment")

    for code, model_name, type_name in DRONES + PLANTAS:
        etype, _ = EquipmentType.objects.get_or_create(name=type_name)
        model, created = EquipmentModel.objects.get_or_create(
            brand=BRAND,
            model_code=code,
            revision="",
            defaults={"name": model_name, "equipment_type": etype},
        )
        # T50 y D12500iE ya existían colgados de los tipos genéricos.
        if not created and model.equipment_type_id != etype.id:
            model.equipment_type = etype
            model.save(update_fields=["equipment_type"])
        # Un equipo con modelo técnico toma el tipo de ese modelo: el formulario
        # solo ofrece los modelos del tipo elegido.
        Equipment.objects.filter(catalog_model=model).exclude(equipment_type=etype).update(
            equipment_type=etype
        )


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0004_equipmentcomponent"),
    ]

    operations = [
        migrations.RunPython(seed_dji_line, migrations.RunPython.noop),
    ]
