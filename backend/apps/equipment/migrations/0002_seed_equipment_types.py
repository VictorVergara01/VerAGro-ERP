from django.db import migrations

TYPES = [
    "Drone agrícola",
    "Drone de mapeo",
    "Planta eléctrica",
    "Cargador",
    "Batería",
    "Bomba",
    "Atomizador",
    "Control remoto",
    "Otro",
]


def seed_types(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    for name in TYPES:
        EquipmentType.objects.get_or_create(name=name)


def unseed_types(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    EquipmentType.objects.filter(name__in=TYPES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_types, unseed_types),
    ]
