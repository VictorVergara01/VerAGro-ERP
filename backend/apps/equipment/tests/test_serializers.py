import pytest

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType
from apps.equipment.serializers import EquipmentSerializer


@pytest.mark.django_db
def test_customer_owner_requires_customer():
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    s = EquipmentSerializer(
        data={"name": "B1", "equipment_type": t.id, "owner_type": "customer"}
    )
    assert s.is_valid() is False
    assert "customer" in str(s.errors).lower() or "non_field" in s.errors


@pytest.mark.django_db
def test_company_owner_rejects_customer():
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    s = EquipmentSerializer(
        data={
            "name": "B1",
            "equipment_type": t.id,
            "owner_type": "company",
            "customer": c.id,
        }
    )
    assert s.is_valid() is False


@pytest.mark.django_db
def test_valid_customer_equipment():
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    s = EquipmentSerializer(
        data={
            "name": "B1",
            "equipment_type": t.id,
            "owner_type": "customer",
            "customer": c.id,
        }
    )
    assert s.is_valid(), s.errors


@pytest.mark.django_db
def test_partial_update_keeps_owner_invariant():
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="B1", equipment_type=t, owner_type="customer", customer=c
    )
    s = EquipmentSerializer(instance=e, data={"customer": None}, partial=True)
    assert s.is_valid() is False
