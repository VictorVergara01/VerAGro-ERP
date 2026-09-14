import pytest
from decimal import Decimal

from apps.customers.models import Customer
from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart


@pytest.mark.django_db
def test_part_component_optional_and_linked():
    cli = Customer.objects.create(name="C")
    prod = Product.objects.create(sku="P1", name="P1")
    order = ServiceOrder.objects.create(customer=cli)

    # Sin componente (modo heredado)
    p1 = ServiceOrderPart.objects.create(service_order=order, product=prod, quantity=Decimal("1"))
    assert p1.component is None

    # Con componente (modo estructurado)
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50-TEST")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    p2 = ServiceOrderPart.objects.create(
        service_order=order, product=prod, quantity=Decimal("1"), component=comp
    )
    assert p2.component == comp
    assert list(comp.service_order_parts.all()) == [p2]
