import pytest
from django.db import IntegrityError

from apps.equipment.models import EquipmentModel, EquipmentType, Equipment


@pytest.fixture
def eqtype(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return t


@pytest.mark.django_db
def test_equipment_model_str_and_defaults(eqtype):
    m = EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="DJI Agras T50", model_code="T50"
    )
    assert str(m) == "DJI DJI Agras T50"
    assert m.is_active is True
    assert m.diagram_type == "svg"
    assert m.revision == ""


@pytest.mark.django_db
def test_equipment_model_unique_brand_code_revision(eqtype):
    EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="T50", model_code="T50"
    )
    with pytest.raises(IntegrityError):
        EquipmentModel.objects.create(
            equipment_type=eqtype, brand="DJI", name="T50 dup", model_code="T50"
        )


@pytest.mark.django_db
def test_equipment_catalog_model_link_optional(eqtype):
    m = EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="T50", model_code="T50"
    )
    e_sin = Equipment.objects.create(name="Viejo", equipment_type=eqtype)
    assert e_sin.catalog_model is None  # heredado sigue funcionando
    e_con = Equipment.objects.create(
        name="Nuevo", equipment_type=eqtype, catalog_model=m
    )
    assert list(m.equipment_units.all()) == [e_con]
