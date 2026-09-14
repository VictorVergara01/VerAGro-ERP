import importlib

import pytest
from django.apps import apps as django_apps

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentModel, EquipmentType

migration = importlib.import_module("apps.equipment.migrations.0005_seed_dji_agras_line")

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


def run_seed():
    migration.seed_dji_line(django_apps, None)


@pytest.mark.django_db
@pytest.mark.parametrize("code, model_name, type_name", DRONES + PLANTAS)
def test_each_model_is_seeded_with_its_own_active_type(code, model_name, type_name):
    model = EquipmentModel.objects.get(brand="DJI", model_code=code, revision="")
    assert model.name == model_name
    assert model.is_active
    assert model.equipment_type.name == type_name
    assert model.equipment_type.is_active


@pytest.mark.django_db
def test_seed_is_idempotent():
    n_types = EquipmentType.objects.count()
    n_models = EquipmentModel.objects.count()
    run_seed()
    run_seed()
    assert EquipmentType.objects.count() == n_types
    assert EquipmentModel.objects.count() == n_models


@pytest.mark.django_db
def test_existing_models_move_to_their_own_type():
    # Estado previo real: T50 y D12500iE colgaban de los tipos genéricos.
    drone, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    planta, _ = EquipmentType.objects.get_or_create(name="Planta eléctrica")
    EquipmentModel.objects.filter(model_code="T50").update(equipment_type=drone)
    EquipmentModel.objects.filter(model_code="D12500IE").update(equipment_type=planta)

    run_seed()

    assert EquipmentModel.objects.get(model_code="T50").equipment_type.name == "Agras T50"
    assert EquipmentModel.objects.get(model_code="D12500IE").equipment_type.name == "Planta D12500iE"
    # Los tipos genéricos no se borran (los usan la plantilla de checklist y equipos viejos).
    assert EquipmentType.objects.filter(name__in=["Drone agrícola", "Planta eléctrica"]).count() == 2


@pytest.mark.django_db
def test_equipment_with_catalog_model_takes_the_model_type():
    drone, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    t50 = EquipmentModel.objects.get(model_code="T50")
    EquipmentModel.objects.filter(pk=t50.pk).update(equipment_type=drone)
    customer = Customer.objects.create(name="Finca")
    with_model = Equipment.objects.create(
        name="T50 de la finca", equipment_type=drone, customer=customer, catalog_model=t50
    )
    without_model = Equipment.objects.create(name="Dron viejo", equipment_type=drone, customer=customer)

    run_seed()

    with_model.refresh_from_db()
    without_model.refresh_from_db()
    assert with_model.equipment_type.name == "Agras T50"
    assert without_model.equipment_type == drone


@pytest.mark.django_db
def test_seed_respects_a_type_the_admin_deactivated():
    EquipmentType.objects.filter(name="Agras MG-1").update(is_active=False)
    run_seed()
    assert EquipmentType.objects.get(name="Agras MG-1").is_active is False
