import pytest
from django.db import IntegrityError

from apps.checklists.models import (
    ChecklistTemplate,
    ChecklistTemplateItem,
    ServiceChecklist,
    ServiceChecklistItem,
)
from apps.customers.models import Customer
from apps.service_orders.models import ServiceOrder


@pytest.fixture
def order(db):
    customer = Customer.objects.create(name="Cliente CL")
    return ServiceOrder.objects.create(customer=customer)


@pytest.fixture
def template(db):
    t = ChecklistTemplate.objects.create(name="Plantilla")
    ChecklistTemplateItem.objects.create(template=t, name="Item 1", order=1)
    return t


@pytest.mark.django_db
def test_seed_dji_template_exists():
    t = ChecklistTemplate.objects.get(name="Checklist DJI Agras T50")
    assert t.equipment_type.name == "Drone agrícola"
    assert t.items.count() == 16
    assert t.items.first().name == "Revisar hélices."


@pytest.mark.django_db
def test_item_defaults(template):
    item = template.items.first()
    assert item.is_required is True


@pytest.mark.django_db
def test_service_checklist_item_default_status(order, template):
    checklist = ServiceChecklist.objects.create(
        service_order=order, checklist_template=template
    )
    item = ServiceChecklistItem.objects.create(
        service_checklist=checklist, template_item=template.items.first()
    )
    assert item.status == ServiceChecklistItem.Status.PENDING
    assert item.priority == ""


@pytest.mark.django_db
def test_unique_template_per_order(order, template):
    ServiceChecklist.objects.create(service_order=order, checklist_template=template)
    with pytest.raises(IntegrityError):
        ServiceChecklist.objects.create(
            service_order=order, checklist_template=template
        )


@pytest.mark.django_db
def test_cascade_items(order, template):
    checklist = ServiceChecklist.objects.create(
        service_order=order, checklist_template=template
    )
    ServiceChecklistItem.objects.create(
        service_checklist=checklist, template_item=template.items.first()
    )
    cid = checklist.id
    checklist.delete()
    assert not ServiceChecklistItem.objects.filter(service_checklist_id=cid).exists()
