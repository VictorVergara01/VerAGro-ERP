import pytest
from django.core.management import call_command

from apps.equipment.models import EquipmentModel, EquipmentComponent


@pytest.mark.django_db
def test_seed_creates_both_models_and_trees():
    call_command("seed_equipment_catalog")
    t50 = EquipmentModel.objects.get(model_code="T50")
    d125 = EquipmentModel.objects.get(model_code="D12500IE")
    assert t50.name == "DJI Agras T50"
    assert d125.name == "DJI D12500iE"
    # T50 no tiene componentes (el árbol viene del importador)
    assert not EquipmentComponent.objects.filter(equipment_model=t50).exists()
    # D12500iE tiene su árbol
    assert EquipmentComponent.objects.filter(equipment_model=d125, code="engine").exists()


@pytest.mark.django_db
def test_seed_is_idempotent():
    call_command("seed_equipment_catalog")
    n_models = EquipmentModel.objects.count()
    n_components = EquipmentComponent.objects.count()
    call_command("seed_equipment_catalog")  # segunda vez
    assert EquipmentModel.objects.count() == n_models
    assert EquipmentComponent.objects.count() == n_components
