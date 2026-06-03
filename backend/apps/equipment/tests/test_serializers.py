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
    assert "non_field_errors" in s.errors


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


@pytest.mark.django_db
def test_valid_company_equipment_without_customer():
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    s = EquipmentSerializer(
        data={"name": "Planta 1", "equipment_type": t.id, "owner_type": "company"}
    )
    assert s.is_valid(), s.errors


@pytest.mark.django_db
def test_patch_to_company_clearing_customer_is_valid():
    # Transición correcta cliente→empresa: enviar owner_type y customer juntos.
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="B1", equipment_type=t, owner_type="customer", customer=c
    )
    s = EquipmentSerializer(
        instance=e, data={"owner_type": "company", "customer": None}, partial=True
    )
    assert s.is_valid(), s.errors


@pytest.mark.django_db
def test_patch_to_company_without_clearing_customer_is_rejected():
    # Cambiar solo owner_type a empresa dejando el customer en la instancia debe fallar.
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="B1", equipment_type=t, owner_type="customer", customer=c
    )
    s = EquipmentSerializer(instance=e, data={"owner_type": "company"}, partial=True)
    assert s.is_valid() is False
