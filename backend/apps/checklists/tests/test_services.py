from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.checklists.models import (
    ChecklistTemplate,
    ChecklistTemplateItem,
    ServiceChecklistItem,
)
from apps.checklists.services import apply_recommended_parts, instantiate_checklist
from apps.customers.models import Customer
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart


@pytest.fixture
def order(db):
    customer = Customer.objects.create(name="Cliente SV")
    return ServiceOrder.objects.create(customer=customer)


@pytest.fixture
def template(db):
    t = ChecklistTemplate.objects.create(name="Plantilla")
    for i in range(1, 4):
        ChecklistTemplateItem.objects.create(template=t, name=f"Item {i}", order=i)
    # Un ítem inactivo no debería instanciarse... no hay flag de activo por ítem,
    # así que los 3 se instancian.
    return t


@pytest.mark.django_db
def test_instantiate_creates_pending_items(order, template):
    checklist = instantiate_checklist(service_order=order, template=template)
    assert checklist.items.count() == 3
    assert all(
        i.status == ServiceChecklistItem.Status.PENDING
        for i in checklist.items.all()
    )


@pytest.mark.django_db
def test_instantiate_duplicate_fails(order, template):
    instantiate_checklist(service_order=order, template=template)
    with pytest.raises(ValidationError):
        instantiate_checklist(service_order=order, template=template)


@pytest.mark.django_db
def test_apply_recommended_parts_adds_part(order, template):
    product = Product.objects.create(
        sku="RP1", name="Pieza", average_cost=Decimal("8"), sale_price=Decimal("20")
    )
    checklist = instantiate_checklist(service_order=order, template=template)
    item = checklist.items.first()
    item.status = ServiceChecklistItem.Status.REQUIRES_REPLACEMENT
    item.recommended_product = product
    item.save()

    created = apply_recommended_parts(checklist)
    assert len(created) == 1
    part = ServiceOrderPart.objects.get(service_order=order, product=product)
    assert part.status == ServiceOrderPart.Status.REQUIRED
    assert part.unit_cost == Decimal("8")
    assert part.unit_price == Decimal("20")
    order.refresh_from_db()
    assert order.total_amount == Decimal("20.00")  # 1 x 20


@pytest.mark.django_db
def test_apply_recommended_parts_idempotent(order, template):
    product = Product.objects.create(sku="RP2", name="Pieza", sale_price=Decimal("5"))
    checklist = instantiate_checklist(service_order=order, template=template)
    item = checklist.items.first()
    item.status = ServiceChecklistItem.Status.REQUIRES_REPLACEMENT
    item.recommended_product = product
    item.save()

    apply_recommended_parts(checklist)
    second = apply_recommended_parts(checklist)
    assert second == []  # no duplica
    assert ServiceOrderPart.objects.filter(
        service_order=order, product=product
    ).count() == 1
