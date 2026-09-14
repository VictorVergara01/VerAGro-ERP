import pytest
from django.db import IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.equipment.models import EquipmentModel, EquipmentType, Equipment, EquipmentComponent


@pytest.fixture
def eqtype(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return t


@pytest.mark.django_db
def test_equipment_model_str_and_defaults(eqtype):
    m = EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="DJI Agras T50", model_code="T50-TEST"
    )
    assert str(m) == "DJI DJI Agras T50"
    assert m.is_active is True
    assert m.diagram_type == "svg"
    assert m.revision == ""


@pytest.mark.django_db
def test_equipment_model_unique_brand_code_revision(eqtype):
    EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="T50-TEST", model_code="T50-TEST"
    )
    with pytest.raises(IntegrityError):
        EquipmentModel.objects.create(
            equipment_type=eqtype, brand="DJI", name="T50 dup", model_code="T50-TEST"
        )


@pytest.mark.django_db
def test_equipment_catalog_model_link_optional(eqtype):
    m = EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="T50-TEST", model_code="T50-TEST"
    )
    e_sin = Equipment.objects.create(name="Viejo", equipment_type=eqtype)
    assert e_sin.catalog_model is None  # heredado sigue funcionando
    e_con = Equipment.objects.create(
        name="Nuevo", equipment_type=eqtype, catalog_model=m
    )
    assert list(m.equipment_units.all()) == [e_con]


def _model(eqtype, code="T50-TEST"):
    return EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name=code, model_code=code
    )


@pytest.mark.django_db
def test_component_path(eqtype):
    m = _model(eqtype)
    prop = EquipmentComponent.objects.create(
        equipment_model=m, code="propulsion", name="Sistema de propulsión",
        component_type="assembly",
    )
    arm = EquipmentComponent.objects.create(
        equipment_model=m, parent=prop, code="arm_m1", name="Brazo M1",
        component_type="assembly",
    )
    motor = EquipmentComponent.objects.create(
        equipment_model=m, parent=arm, code="motor_m1", name="Motor",
    )
    assert motor.path == "Sistema de propulsión > Brazo M1 > Motor"


@pytest.mark.django_db
def test_component_code_unique_per_model(eqtype):
    m = _model(eqtype)
    EquipmentComponent.objects.create(equipment_model=m, code="motor", name="Motor")
    with pytest.raises(IntegrityError):
        EquipmentComponent.objects.create(equipment_model=m, code="motor", name="Otro")


@pytest.mark.django_db
def test_component_parent_must_be_same_model(eqtype):
    m1 = _model(eqtype, "T50-TEST")
    m2 = _model(eqtype, "D125")
    p = EquipmentComponent.objects.create(equipment_model=m1, code="a", name="A")
    child = EquipmentComponent(equipment_model=m2, parent=p, code="b", name="B")
    with pytest.raises(DjangoValidationError):
        child.full_clean()


@pytest.mark.django_db
def test_component_rejects_cycle(eqtype):
    m = _model(eqtype)
    a = EquipmentComponent.objects.create(equipment_model=m, code="a", name="A")
    b = EquipmentComponent.objects.create(equipment_model=m, parent=a, code="b", name="B")
    a.parent = b  # crea ciclo a->b->a
    with pytest.raises(DjangoValidationError):
        a.full_clean()
