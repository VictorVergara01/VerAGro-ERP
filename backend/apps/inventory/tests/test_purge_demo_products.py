from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from apps.billing.models import Invoice, InvoiceLine, Quote, QuoteLine
from apps.checklists.models import (
    ChecklistTemplate,
    ChecklistTemplateItem,
    ServiceChecklist,
    ServiceChecklistItem,
)
from apps.customers.models import Customer
from apps.inventory.models import InventoryMovement, Product
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.service_orders.models import ServiceOrder, ServiceOrderPart
from apps.suppliers.models import Supplier


@pytest.fixture
def datos_de_prueba(db):
    demo = Product.objects.create(sku="SKU-000001", name="Demo")
    real = Product.objects.create(sku="T50-001", name="Real")
    InventoryMovement.objects.create(
        product=demo,
        movement_type=InventoryMovement.MovementType.ADJUSTMENT_IN,
        quantity=Decimal("1"),
        unit_cost=Decimal("1"),
    )
    return demo, real


@pytest.fixture
def service_order(db):
    customer = Customer.objects.create(name="Cliente OS")
    return ServiceOrder.objects.create(customer=customer)


@pytest.fixture
def purchase_order(db):
    supplier = Supplier.objects.create(name="Proveedor")
    return PurchaseOrder.objects.create(supplier=supplier)


@pytest.mark.django_db
def test_dry_run_es_el_comportamiento_por_defecto(datos_de_prueba):
    demo, real = datos_de_prueba
    out = StringIO()
    call_command("purge_demo_products", stdout=out)
    assert Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
    texto = out.getvalue()
    assert "SKU-000001" in texto
    assert "T50-001" not in texto


@pytest.mark.django_db
def test_dry_run_flag_explicito_no_borra_nada(datos_de_prueba):
    # M1: --dry-run está documentado (help + spec) pero antes del fix no existía
    # como argumento y la invocación documentada fallaba con "unrecognized
    # arguments". Por sí solo no cambia nada: el dry-run ya es el comportamiento
    # por defecto. Lo que sí hace es entrar en conflicto con --confirm (abajo).
    demo, real = datos_de_prueba
    out = StringIO()
    call_command("purge_demo_products", "--dry-run", stdout=out)
    assert Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
    assert InventoryMovement.objects.count() == 1


@pytest.mark.django_db
def test_dry_run_con_confirm_aborta_y_no_borra_nada(datos_de_prueba):
    # Pedir simular y borrar a la vez es contradictorio, y el riesgo no es
    # simétrico: si se ignorara --dry-run, quien creyó simular pierde datos. Se
    # aborta antes de tocar la base para que tenga que elegir.
    demo, real = datos_de_prueba
    with pytest.raises(CommandError) as exc:
        call_command("purge_demo_products", "--dry-run", "--confirm", stdout=StringIO())
    assert "contradictorios" in str(exc.value)
    assert Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
    assert InventoryMovement.objects.count() == 1


@pytest.mark.django_db
def test_confirm_borra_productos_y_movimientos(datos_de_prueba):
    demo, real = datos_de_prueba
    call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert not Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
    assert InventoryMovement.objects.count() == 0


@pytest.mark.django_db
def test_aborta_si_hay_facturas_afectadas_sin_allow_orphans(datos_de_prueba):
    demo, _ = datos_de_prueba
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    InvoiceLine.objects.create(
        invoice=invoice, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )
    with pytest.raises(CommandError):
        call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert Product.objects.filter(pk=demo.pk).exists()   # no borró nada


@pytest.mark.django_db
def test_allow_orphans_permite_borrar_y_deja_la_linea_huerfana(datos_de_prueba):
    demo, _ = datos_de_prueba
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    line = InvoiceLine.objects.create(
        invoice=invoice, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )
    call_command(
        "purge_demo_products", "--confirm", "--allow-orphans", stdout=StringIO()
    )
    line.refresh_from_db()
    assert line.product_id is None              # SET_NULL
    assert not Product.objects.filter(pk=demo.pk).exists()


@pytest.mark.django_db
def test_bloquea_por_piezas_de_orden_de_servicio(datos_de_prueba, service_order):
    demo, _ = datos_de_prueba
    ServiceOrderPart.objects.create(
        service_order=service_order, product=demo, quantity=Decimal("1")
    )
    with pytest.raises(CommandError):
        call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert Product.objects.filter(pk=demo.pk).exists()   # PROTECT: no borró nada


@pytest.mark.django_db
def test_bloquea_por_lineas_de_orden_de_compra(datos_de_prueba, purchase_order):
    demo, _ = datos_de_prueba
    PurchaseOrderLine.objects.create(
        purchase_order=purchase_order,
        product=demo,
        quantity_ordered=Decimal("1"),
        unit_purchase_cost=Decimal("1"),
    )
    with pytest.raises(CommandError):
        call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert Product.objects.filter(pk=demo.pk).exists()   # PROTECT: no borró nada


@pytest.mark.django_db
def test_aborta_si_hay_cotizaciones_afectadas_sin_allow_orphans(datos_de_prueba):
    demo, _ = datos_de_prueba
    customer = Customer.objects.create(name="Cliente cotización")
    quote = Quote.objects.create(customer=customer)
    QuoteLine.objects.create(
        quote=quote, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )
    with pytest.raises(CommandError):
        call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert Product.objects.filter(pk=demo.pk).exists()   # no borró nada


@pytest.mark.django_db
def test_allow_orphans_deja_huerfana_la_linea_de_cotizacion(datos_de_prueba):
    demo, _ = datos_de_prueba
    customer = Customer.objects.create(name="Cliente cotización")
    quote = Quote.objects.create(customer=customer)
    line = QuoteLine.objects.create(
        quote=quote, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )
    call_command(
        "purge_demo_products", "--confirm", "--allow-orphans", stdout=StringIO()
    )
    line.refresh_from_db()
    assert line.product_id is None               # SET_NULL
    assert not Product.objects.filter(pk=demo.pk).exists()


@pytest.mark.django_db
def test_aborta_si_hay_checklist_items_afectados_sin_allow_orphans(
    datos_de_prueba, service_order
):
    demo, _ = datos_de_prueba
    template = ChecklistTemplate.objects.create(name="Plantilla")
    template_item = ChecklistTemplateItem.objects.create(
        template=template, name="Ítem"
    )
    checklist = ServiceChecklist.objects.create(
        service_order=service_order, checklist_template=template
    )
    ServiceChecklistItem.objects.create(
        service_checklist=checklist,
        template_item=template_item,
        recommended_product=demo,
    )
    with pytest.raises(CommandError):
        call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert Product.objects.filter(pk=demo.pk).exists()   # no borró nada


@pytest.mark.django_db
def test_allow_orphans_deja_huerfano_el_checklist_item(datos_de_prueba, service_order):
    demo, _ = datos_de_prueba
    template = ChecklistTemplate.objects.create(name="Plantilla")
    template_item = ChecklistTemplateItem.objects.create(
        template=template, name="Ítem"
    )
    checklist = ServiceChecklist.objects.create(
        service_order=service_order, checklist_template=template
    )
    item = ServiceChecklistItem.objects.create(
        service_checklist=checklist,
        template_item=template_item,
        recommended_product=demo,
    )
    call_command(
        "purge_demo_products", "--confirm", "--allow-orphans", stdout=StringIO()
    )
    item.refresh_from_db()
    assert item.recommended_product_id is None    # SET_NULL
    assert not Product.objects.filter(pk=demo.pk).exists()


@pytest.mark.django_db
def test_muestra_protect_y_set_null_antes_de_abortar_sin_flags(
    datos_de_prueba, service_order
):
    """Fix round 1: el dry-run (la llamada sin flags, la más segura) debe
    calcular e imprimir TODOS los hallazgos -PROTECT y SET_NULL- antes de
    decidir si aborta, para no obligar al usuario a resolver un bloqueo,
    reejecutar, y sólo entonces enterarse del huérfano."""
    demo, _ = datos_de_prueba
    ServiceOrderPart.objects.create(
        service_order=service_order, product=demo, quantity=Decimal("1")
    )
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    InvoiceLine.objects.create(
        invoice=invoice, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )

    out = StringIO()
    with pytest.raises(CommandError):
        call_command("purge_demo_products", stdout=out)  # sin ningún flag

    texto = out.getvalue()
    assert "orden de servicio" in texto               # sección PROTECT
    assert "líneas de factura" in texto               # sección SET_NULL
    assert "SET_NULL" in texto
    assert Product.objects.filter(pk=demo.pk).exists()  # no borró nada


@pytest.mark.django_db
def test_prefix_vacio_se_rechaza_y_no_borra_nada(datos_de_prueba):
    demo, real = datos_de_prueba
    with pytest.raises(CommandError):
        call_command(
            "purge_demo_products", "--prefix", "", "--confirm", stdout=StringIO()
        )
    assert Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()


@pytest.mark.django_db
def test_prefix_de_dos_caracteres_se_rechaza(datos_de_prueba):
    demo, real = datos_de_prueba
    with pytest.raises(CommandError):
        call_command(
            "purge_demo_products", "--prefix", "SK", "--confirm", stdout=StringIO()
        )
    assert Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()


@pytest.mark.django_db
def test_prefix_de_tres_caracteres_es_valido(datos_de_prueba):
    demo, real = datos_de_prueba
    call_command(
        "purge_demo_products", "--prefix", "SKU", "--confirm", stdout=StringIO()
    )
    assert not Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
