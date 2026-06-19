import pytest
from rest_framework.exceptions import ValidationError

from apps.field_jobs.services import calculate_spray_mix


def _products():
    return [
        {"name": "Glifosato 48%", "dose_per_liter": 8.0, "dose_unit": "mL/L"},
        {"name": "Coadyuvante", "dose_per_liter": 3.0, "dose_unit": "mL/L"},
    ]


def test_spray_mix_example_from_spec():
    result = calculate_spray_mix(
        hectares=12.0,
        water_per_hectare=8.0,
        tank_volume_liters=30.0,
        products=_products(),
    )
    assert result["total_volume_liters"] == 96.0
    assert result["fills_needed"] == 4
    assert result["full_fills"] == 3
    assert result["last_fill_liters"] == 6.0
    assert result["per_full_fill"] == [
        {"name": "Glifosato 48%", "quantity": 240.0, "unit": "mL"},
        {"name": "Coadyuvante", "quantity": 90.0, "unit": "mL"},
    ]
    assert result["last_fill"] == [
        {"name": "Glifosato 48%", "quantity": 48.0, "unit": "mL"},
        {"name": "Coadyuvante", "quantity": 18.0, "unit": "mL"},
    ]


def test_spray_mix_exact_division_has_no_partial_fill():
    result = calculate_spray_mix(
        hectares=10.0,
        water_per_hectare=9.0,  # 90 L total
        tank_volume_liters=30.0,
        products=[{"name": "X", "dose_per_liter": 2.0, "dose_unit": "mL/L"}],
    )
    assert result["total_volume_liters"] == 90.0
    assert result["fills_needed"] == 3
    assert result["full_fills"] == 3
    assert result["last_fill_liters"] == 0.0
    assert result["last_fill"] == []


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(hectares=0, water_per_hectare=8, tank_volume_liters=30),
        dict(hectares=12, water_per_hectare=0, tank_volume_liters=30),
        dict(hectares=12, water_per_hectare=8, tank_volume_liters=0),
    ],
)
def test_spray_mix_rejects_nonpositive_numbers(kwargs):
    with pytest.raises(ValidationError):
        calculate_spray_mix(products=_products(), **kwargs)


def test_spray_mix_rejects_empty_products():
    with pytest.raises(ValidationError):
        calculate_spray_mix(
            hectares=12, water_per_hectare=8, tank_volume_liters=30, products=[]
        )


def test_spray_mix_rejects_nonpositive_dose():
    with pytest.raises(ValidationError):
        calculate_spray_mix(
            hectares=12,
            water_per_hectare=8,
            tank_volume_liters=30,
            products=[{"name": "X", "dose_per_liter": 0, "dose_unit": "mL/L"}],
        )
