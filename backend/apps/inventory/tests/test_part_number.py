import pytest
from apps.inventory.models import Product


@pytest.mark.django_db
def test_product_part_number_optional_default_blank():
    p = Product.objects.create(sku="PN-1", name="Pieza")
    assert p.part_number == ""
    p2 = Product.objects.create(sku="PN-2", name="Pieza OEM", part_number="YC.JG.MY001043")
    assert p2.part_number == "YC.JG.MY001043"
