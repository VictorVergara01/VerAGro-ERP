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


@pytest.mark.django_db
def test_company_api_exposes_field_job_prices():
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    User = get_user_model()
    user = User.objects.create_user(
        email="a@v.com", password="x", full_name="A", role="super_admin"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    resp = c.get("/api/company/")
    assert resp.status_code == 200
    for key in (
        "fumigation_price_per_hectare",
        "spreading_price_per_quintal",
        "drone_tank_volume_liters",
        "default_water_per_hectare",
    ):
        assert key in resp.data
