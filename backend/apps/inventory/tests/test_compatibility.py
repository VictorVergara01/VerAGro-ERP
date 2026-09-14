import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError

from apps.equipment.models import EquipmentModel, EquipmentType, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility


@pytest.fixture
def setup(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50-TEST")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    prod = Product.objects.create(sku="MOT-1", name="Motor CW")
    return m, comp, prod


@pytest.mark.django_db
def test_create_valid_compatibility(setup):
    m, comp, prod = setup
    c = ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp, is_primary=True)
    c.full_clean()  # no debe lanzar
    assert list(prod.compatibilities.all()) == [c]
    assert list(comp.product_compatibilities.all()) == [c]


@pytest.mark.django_db
def test_compatibility_unique_triple(setup):
    m, comp, prod = setup
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)
    with pytest.raises(IntegrityError):
        ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)


@pytest.mark.django_db
def test_compatibility_component_must_belong_to_model(setup):
    m, comp, prod = setup
    other = EquipmentModel.objects.create(
        equipment_type=m.equipment_type, brand="DJI", name="D125", model_code="D125"
    )
    c = ProductCompatibility(product=prod, equipment_model=other, component=comp)
    with pytest.raises(DjangoValidationError):
        c.full_clean()
