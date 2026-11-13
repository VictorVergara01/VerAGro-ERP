import pytest
from rest_framework.test import APIClient
from apps.inventory.models import Product, ProductAlias, ProductCategory, ProductCompatibility
from apps.equipment.models import EquipmentModel, EquipmentComponent
from apps.users.models import User

pytestmark = pytest.mark.django_db


def test_catalog_filters_include_each_section_once_and_search_old_sku():
    user = User.objects.create_user(email="identity@example.com", password="pass", role="inventory")
    client = APIClient()
    client.force_authenticate(user)
    model = EquipmentModel.objects.get(model_code="T50")
    first = ProductCategory.objects.create(name="Tanque prueba")
    second = ProductCategory.objects.create(name="Chasis prueba")
    product = Product.objects.create(sku="T50-001", name="Tornillo", part_number="OEM-1", brand="DJI", category=first)
    product.catalog_categories.add(first, second)
    ProductAlias.objects.create(product=product, sku="T50-099")
    for code in ("x1", "x2"):
        component = EquipmentComponent.objects.create(equipment_model=model, code=code, name=code)
        ProductCompatibility.objects.create(product=product, equipment_model=model, component=component)
    # Incluso sin la relación antigua, el modelo técnico debe encontrar la pieza.
    for query in (f"equipment_type={model.equipment_type_id}", f"category={second.pk}", "search=T50-099"):
        result = client.get(f"/api/inventory/products/?{query}")
        assert result.status_code == 200
        assert result.data["count"] == 1
        assert result.data["results"][0]["sku_aliases"] == ["T50-099"]
    summary = client.get(f"/api/inventory/products/count-progress/?category={second.pk}&equipment_type={model.equipment_type_id}")
    assert summary.data["total"] == 1
    assert summary.data["uncounted"] == 1
    ProductCategory.objects.create(name="Otra categoría sin piezas del modelo")
    categories = client.get(f"/api/inventory/categories/?equipment_model={model.pk}")
    assert categories.status_code == 200
    assert {row["id"] for row in categories.data} == {first.pk, second.pk}
    assert client.post("/api/inventory/products/", {"sku": "T50-099", "name": "Clon"}, format="json").status_code == 400
    assert client.post("/api/inventory/products/", {"sku": "T50-100", "name": "Clon", "part_number": "OEM-1", "brand": "DJI"}, format="json").status_code == 400
    assert client.post("/api/inventory/products/", {"sku": "T50-101", "name": "Clon sin marca", "part_number": "OEM-1"}, format="json").status_code == 400
