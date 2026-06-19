from decimal import Decimal

import pytest

from apps.core.models import CompanyProfile


@pytest.mark.django_db
def test_company_profile_field_job_defaults():
    company = CompanyProfile.load()
    assert company.fumigation_price_per_hectare == Decimal("20")
    assert company.spreading_price_per_quintal == Decimal("10")
    assert company.drone_tank_volume_liters == Decimal("30")
    assert company.default_water_per_hectare == Decimal("8")
