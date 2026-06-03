import pytest

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType


@pytest.mark.django_db
def test_equipment_type_str():
    t = EquipmentType.objects.create(name="Drone agrícola")
    assert str(t) == "Drone agrícola"
    assert t.is_active is True


@pytest.mark.django_db
def test_create_equipment_defaults():
    t = EquipmentType.objects.create(name="Batería")
    e = Equipment.objects.create(name="Batería T50 #1", equipment_type=t)
    assert e.status == "active"
    assert e.owner_type == "customer"
    assert str(e) == "Batería T50 #1"
    assert e.created_at is not None


@pytest.mark.django_db
def test_equipment_linked_to_customer():
    t = EquipmentType.objects.create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="Bomba 1", equipment_type=t, owner_type="customer", customer=c
    )
    assert e.customer == c
    assert list(c.equipment.all()) == [e]
