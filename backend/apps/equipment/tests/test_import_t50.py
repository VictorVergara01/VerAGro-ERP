import pytest
from django.core.management import call_command
from openpyxl import Workbook, load_workbook
from django.core.management.base import CommandError

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility, ProductAlias, ProductCategory, InitialStockCount


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
    # Lo siembra la migración equipment.0005 (el importador busca model_code="T50").
    return EquipmentModel.objects.get(brand="DJI", model_code="T50", revision="")


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
    # Sin el modelo T50 sembrado, el comando falla claro. La migración
    # equipment.0005 lo crea, así que se quita para simular una base sin él.
    from django.core.management.base import CommandError
    EquipmentModel.objects.filter(brand="DJI", model_code="T50").delete()
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    with pytest.raises(CommandError):
        call_command("import_agras_t50_parts", str(xlsx))


@pytest.mark.django_db
def test_import_matches_accented_category(t50, tmp_path):
    # Verifica que una categoría con acentos coincida correctamente con la clave sin acento del mapa.
    xlsx = tmp_path / "t50_accented.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "T50 Todas las Partes"
    ws.append(["SKU", "Numero de Pieza", "Nombre de Pieza", "Modelo", "Categoria"])
    # La categoría tiene acento: "Tanque de Fumigación" en lugar de "tanque de fumigacion"
    ws.append(["T50-ACCENT-001", "TEST.001", "Test Part with Accent", "Agras T50", "Tanque de Fumigación"])
    wb.save(str(xlsx))

    call_command("import_agras_t50_parts", str(xlsx))

    # Verifica que el componente existe con el código esperado (sin acento)
    comp = EquipmentComponent.objects.get(equipment_model=t50, code="tanque_fumigacion")
    assert comp is not None
    # Verifica que el producto se creó y está asociado al componente correcto
    p = Product.objects.get(sku="T50-ACCENT-001")
    assert ProductCompatibility.objects.filter(
        product=p, equipment_model=t50, component=comp
    ).exists()


def _repeated_xlsx(path):
    _make_xlsx(str(path))
    wb = load_workbook(path)
    wb.active.append(["T50-005", "YC.WJ.L00870", "Screw M30", "Agras T50", "Protector Frontal"])
    wb.save(path)
    wb.close()


@pytest.mark.django_db
def test_repeated_oem_is_one_product_in_multiple_sections(t50, tmp_path):
    xlsx = tmp_path / "repeated.xlsx"
    _repeated_xlsx(xlsx)
    call_command("import_agras_t50_parts", str(xlsx))
    product = Product.objects.get(part_number="YC.WJ.L00870")
    assert Product.objects.count() == 4
    assert set(product.catalog_categories.values_list("name", flat=True)) == {"Tanque de fumigación", "Protector frontal"}
    assert set(product.compatibilities.values_list("component__code", flat=True)) == {"tanque_fumigacion", "protector_frontal"}
    assert product.compatible_equipment_types.filter(pk=t50.equipment_type_id).exists()
    assert ProductAlias.objects.get(sku="T50-005").product_id == product.pk
    counts = (Product.objects.count(), ProductAlias.objects.count(), ProductCompatibility.objects.count(), ProductCategory.objects.count())
    call_command("import_agras_t50_parts", str(xlsx))
    assert counts == (Product.objects.count(), ProductAlias.objects.count(), ProductCompatibility.objects.count(), ProductCategory.objects.count())


@pytest.mark.django_db
def test_existing_clones_are_consolidated_and_alias_keeps_original_id(t50, tmp_path):
    xlsx = tmp_path / "clones.xlsx"
    _repeated_xlsx(xlsx)
    canonical = Product.objects.create(sku="T50-002", name="Screw M30", part_number="YC.WJ.L00870")
    duplicate = Product.objects.create(sku="T50-005", name="Screw M30", part_number="YC.WJ.L00870")
    duplicate_id = duplicate.pk
    call_command("import_agras_t50_parts", str(xlsx))
    assert not Product.objects.filter(pk=duplicate_id).exists()
    assert Product.objects.get(part_number="YC.WJ.L00870").pk == canonical.pk
    alias = ProductAlias.objects.get(sku="T50-005")
    assert alias.product_id == canonical.pk
    assert alias.original_product_id == duplicate_id
    assert not InitialStockCount.objects.exists()
    assert canonical.stock_quantity == 0


@pytest.mark.django_db
def test_simulation_does_not_create_products_categories_or_aliases(t50, tmp_path):
    xlsx = tmp_path / "dry.xlsx"
    _repeated_xlsx(xlsx)
    before = (Product.objects.count(), ProductCategory.objects.count(), ProductAlias.objects.count(), EquipmentComponent.objects.count())
    call_command("import_agras_t50_parts", str(xlsx), "--dry-run")
    assert before == (Product.objects.count(), ProductCategory.objects.count(), ProductAlias.objects.count(), EquipmentComponent.objects.count())


@pytest.mark.django_db
def test_clone_with_real_stock_stops_entire_import(t50, tmp_path):
    xlsx = tmp_path / "stock.xlsx"
    _repeated_xlsx(xlsx)
    Product.objects.create(sku="T50-002", name="Screw M30", part_number="YC.WJ.L00870")
    Product.objects.create(sku="T50-005", name="Screw M30", part_number="YC.WJ.L00870", stock_quantity=3)
    with pytest.raises(CommandError, match="existencias"):
        call_command("import_agras_t50_parts", str(xlsx))
    assert Product.objects.count() == 2
    assert not ProductAlias.objects.exists()


@pytest.mark.django_db
def test_clone_with_document_is_not_silently_deleted(t50, tmp_path):
    from apps.customers.models import Customer
    from apps.billing.models import Invoice, InvoiceLine
    xlsx = tmp_path / "document.xlsx"
    _repeated_xlsx(xlsx)
    Product.objects.create(sku="T50-002", name="Screw M30", part_number="YC.WJ.L00870")
    duplicate = Product.objects.create(sku="T50-005", name="Screw M30", part_number="YC.WJ.L00870")
    invoice = Invoice.objects.create(customer=Customer.objects.create(name="Cliente"))
    line = InvoiceLine.objects.create(invoice=invoice, product=duplicate, quantity=1, unit_price=2)
    with pytest.raises(CommandError, match="referencias"):
        call_command("import_agras_t50_parts", str(xlsx))
    line.refresh_from_db()
    assert line.product_id == duplicate.pk
    assert Product.objects.count() == 2


@pytest.mark.django_db
def test_blank_oem_products_are_not_merged_by_name(t50, tmp_path):
    xlsx = tmp_path / "blank.xlsx"
    _make_xlsx(str(xlsx))
    wb = load_workbook(xlsx)
    wb.active.append(["T50-006", "", "Sin OEM", "Agras T50", "Helices"])
    wb.save(xlsx)
    wb.close()
    call_command("import_agras_t50_parts", str(xlsx))
    assert Product.objects.filter(name="Sin OEM").count() == 2
