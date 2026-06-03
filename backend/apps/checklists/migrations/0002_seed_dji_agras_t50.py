from django.db import migrations

TEMPLATE_NAME = "Checklist DJI Agras T50"
EQUIPMENT_TYPE = "Drone agrícola"
ITEMS = [
    "Revisar hélices.",
    "Revisar brazos.",
    "Revisar motores.",
    "Revisar ESC.",
    "Revisar bombas.",
    "Revisar mangueras.",
    "Revisar boquillas / atomizadores.",
    "Revisar flow meter.",
    "Revisar tanque.",
    "Revisar batería.",
    "Revisar cargador.",
    "Verificar firmware.",
    "Prueba de pulverización.",
    "Prueba de centrifugado.",
    "Limpieza general.",
    "Observaciones finales.",
]


def seed(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    ChecklistTemplate = apps.get_model("checklists", "ChecklistTemplate")
    ChecklistTemplateItem = apps.get_model("checklists", "ChecklistTemplateItem")

    equipment_type, _ = EquipmentType.objects.get_or_create(name=EQUIPMENT_TYPE)
    template, created = ChecklistTemplate.objects.get_or_create(
        name=TEMPLATE_NAME,
        defaults={
            "equipment_type": equipment_type,
            "description": "Checklist base de mantenimiento para DJI Agras T50.",
        },
    )
    if created:
        for index, name in enumerate(ITEMS, start=1):
            ChecklistTemplateItem.objects.create(
                template=template, name=name, order=index, is_required=True
            )


def unseed(apps, schema_editor):
    ChecklistTemplate = apps.get_model("checklists", "ChecklistTemplate")
    ChecklistTemplate.objects.filter(name=TEMPLATE_NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("checklists", "0001_initial"),
        ("equipment", "0002_seed_equipment_types"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
