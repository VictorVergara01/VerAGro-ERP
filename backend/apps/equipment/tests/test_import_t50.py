import pytest
from django.core.management import call_command
from openpyxl import Workbook

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility


def _make_xlsx(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "T50 Todas las Partes"
    ws.append(["SKU", "Numero de Pieza", "Nombre de Pieza", "Modelo", "Categoria"])
    ws.append(["T50-001", "BC.AG.SS000543", "Impeller Pump Motor", "Agras T50", "Tanque de Fumigacion"])
    ws.append(["T50-002", "YC.WJ.L00870", "Screw M30", "Agras T50", "Tanque de Fumigacion"])
    ws.append(["T50-003", "YC.JG.ZS005016", "Upper Propeller (CCW)", "Agras T50", "Helices"])
    ws.append(["T50-004", "", "Sin OEM", "Agras T50", "M1-M2 Brazos"])
    wb.save(path)


@pytest.fixture
def t50(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return EquipmentModel.objects.create(
        equipment_type=t, brand="DJI", name="DJI Agras T50", model_code="T50"
    )


@pytest.mark.django_db
def test_import_creates_components_products_compatibilities(t50, tmp_path):
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    call_command("import_agras_t50_parts", str(xlsx))

    # Componentes por categoría (planos, bajo el T50)
    codes = set(
        EquipmentComponent.objects.filter(equipment_model=t50).values_list("code", flat=True)
    )
    assert {"tanque_fumigacion", "helices", "brazos_m1_m2"} <= codes
    # Productos
    p = Product.objects.get(sku="T50-001")
    assert p.name == "Impeller Pump Motor"
    assert p.part_number == "BC.AG.SS000543"
    # Sin OEM → part_number vacío
    assert Product.objects.get(sku="T50-004").part_number == ""
    # Compatibilidad al componente correcto
    comp = EquipmentComponent.objects.get(equipment_model=t50, code="tanque_fumigacion")
    assert ProductCompatibility.objects.filter(product=p, equipment_model=t50, component=comp).exists()
    assert ProductCompatibility.objects.count() == 4


@pytest.mark.django_db
def test_import_is_idempotent(t50, tmp_path):
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    call_command("import_agras_t50_parts", str(xlsx))
    n_comp = EquipmentComponent.objects.count()
    n_prod = Product.objects.count()
    n_compat = ProductCompatibility.objects.count()
    call_command("import_agras_t50_parts", str(xlsx))  # 2ª vez
    assert EquipmentComponent.objects.count() == n_comp
    assert Product.objects.count() == n_prod
    assert ProductCompatibility.objects.count() == n_compat


@pytest.mark.django_db
def test_import_requires_model(tmp_path):
    # Sin el modelo T50 sembrado, el comando falla claro.
    from django.core.management.base import CommandError
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    with pytest.raises(CommandError):
        call_command("import_agras_t50_parts", str(xlsx))
