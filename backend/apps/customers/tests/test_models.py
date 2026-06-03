import pytest

from apps.customers.models import Customer


@pytest.mark.django_db
def test_create_customer():
    c = Customer.objects.create(
        customer_type="company",
        name="Agro SA",
        identification_type="ruc",
        identification_number="155-123-456",
    )
    assert c.is_active is True
    assert str(c) == "Agro SA"
    assert c.created_at is not None


@pytest.mark.django_db
def test_customer_defaults():
    c = Customer.objects.create(name="Juan Perez")
    assert c.customer_type == "person"
    assert c.is_active is True
