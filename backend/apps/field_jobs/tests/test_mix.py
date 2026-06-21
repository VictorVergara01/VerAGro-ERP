import pytest
from rest_framework.exceptions import ValidationError

from apps.field_jobs.services import calculate_mix


def _products():
    return [
        {"name": "Glifosato", "dose_per_hectare": 1.5, "unit": "L/ha"},
        {"name": "Coadyuvante", "dose_per_hectare": 200, "unit": "cc/ha"},
        {"name": "Urea", "dose_per_hectare": 2, "unit": "kg/ha"},
    ]


def test_multi_tank_example():
    r = calculate_mix(hectares=50, caldo_per_hectare=8, tank_volume_liters=200, products=_products())
    assert r["total_caldo_liters"] == 400.0
    assert r["liquid_chemical_liters"] == 85.0   # 75 L + 10 L (200 cc/ha * 50 ha = 10000 cc = 10 L)
    assert r["water_liters"] == 315.0
    assert r["tanks_needed"] == 2
    assert r["full_tanks"] == 2
    assert r["last_tank_liters"] == 0.0
    assert r["products_total"] == [
        {"name": "Glifosato", "quantity": 75.0, "unit": "L"},
        {"name": "Coadyuvante", "quantity": 10.0, "unit": "L"},
        {"name": "Urea", "quantity": 100.0, "unit": "kg"},
    ]
    assert r["per_full_tank"] == [
        {"name": "Glifosato", "quantity": 37.5, "unit": "L"},
        {"name": "Coadyuvante", "quantity": 5.0, "unit": "L"},
        {"name": "Urea", "quantity": 50.0, "unit": "kg"},
    ]
    assert r["water_per_full_tank"] == 157.5
    assert r["last_tank"] == []


def test_single_partial_tank():
    r = calculate_mix(hectares=10, caldo_per_hectare=8, tank_volume_liters=200, products=_products())
    assert r["total_caldo_liters"] == 80.0
    assert r["tanks_needed"] == 1
    assert r["full_tanks"] == 0
    assert r["last_tank_liters"] == 80.0
    # 1.5*10=15 L glifosato; 200cc*10=2000cc=2 L coadyuvante; urea 20 kg
    assert r["water_last_tank"] == 63.0  # 80 - (15+2)
    assert r["last_tank"][0] == {"name": "Glifosato", "quantity": 15.0, "unit": "L"}
    assert r["last_tank"][2] == {"name": "Urea", "quantity": 20.0, "unit": "kg"}
    assert r["per_full_tank"] == []


def test_unit_conversions():
    r = calculate_mix(
        hectares=1, caldo_per_hectare=100, tank_volume_liters=1000,
        products=[
            {"name": "A", "dose_per_hectare": 500, "unit": "cc/ha"},  # 0.5 L
            {"name": "B", "dose_per_hectare": 500, "unit": "g/ha"},   # 0.5 kg
        ],
    )
    assert r["products_total"] == [
        {"name": "A", "quantity": 0.5, "unit": "L"},
        {"name": "B", "quantity": 0.5, "unit": "kg"},
    ]
    assert r["liquid_chemical_liters"] == 0.5


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(hectares=0, caldo_per_hectare=8, tank_volume_liters=200),
        dict(hectares=10, caldo_per_hectare=0, tank_volume_liters=200),
        dict(hectares=10, caldo_per_hectare=8, tank_volume_liters=0),
    ],
)
def test_rejects_nonpositive(kwargs):
    with pytest.raises(ValidationError):
        calculate_mix(products=_products(), **kwargs)


def test_rejects_empty_products():
    with pytest.raises(ValidationError):
        calculate_mix(hectares=10, caldo_per_hectare=8, tank_volume_liters=200, products=[])


def test_rejects_bad_unit():
    with pytest.raises(ValidationError):
        calculate_mix(
            hectares=10, caldo_per_hectare=8, tank_volume_liters=200,
            products=[{"name": "X", "dose_per_hectare": 1, "unit": "L/L"}],
        )
