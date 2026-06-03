import pytest

from apps.equipment.models import EquipmentType

EXPECTED_TYPES = {
    "Drone agrícola",
    "Drone de mapeo",
    "Planta eléctrica",
    "Cargador",
    "Batería",
    "Bomba",
    "Atomizador",
    "Control remoto",
    "Otro",
}


@pytest.mark.django_db
def test_equipment_types_are_seeded():
    names = set(EquipmentType.objects.values_list("name", flat=True))
    assert EXPECTED_TYPES.issubset(names)
