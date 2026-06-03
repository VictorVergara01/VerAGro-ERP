from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import ServiceChecklist, ServiceChecklistItem


@transaction.atomic
def instantiate_checklist(*, service_order, template, user=None):
    """Crea un ServiceChecklist en la orden a partir de una plantilla.

    Genera un ServiceChecklistItem (status pending) por cada ítem activo de la
    plantilla. Falla si esa plantilla ya fue instanciada en la orden.
    """
    if ServiceChecklist.objects.filter(
        service_order=service_order, checklist_template=template
    ).exists():
        raise ValidationError(
            {"checklist_template": "Esta plantilla ya está instanciada en la orden."}
        )

    checklist = ServiceChecklist.objects.create(
        service_order=service_order, checklist_template=template
    )
    items = [
        ServiceChecklistItem(
            service_checklist=checklist,
            template_item=template_item,
            status=ServiceChecklistItem.Status.PENDING,
        )
        for template_item in template.items.all()
    ]
    ServiceChecklistItem.objects.bulk_create(items)
    return checklist


@transaction.atomic
def apply_recommended_parts(checklist, user=None):
    """Agrega piezas requeridas a la orden por cada ítem requires_replacement.

    Para cada ítem con status requires_replacement y recommended_product, si la
    orden no tiene ya un ServiceOrderPart de ese producto, lo crea (required) con
    costo/precio por defecto del producto. Idempotente. Recalcula el total.
    """
    from apps.service_orders.models import ServiceOrderPart
    from apps.service_orders.services import recalculate_totals

    order = checklist.service_order
    created = []
    items = checklist.items.select_related("recommended_product").filter(
        status=ServiceChecklistItem.Status.REQUIRES_REPLACEMENT,
        recommended_product__isnull=False,
    )
    for item in items:
        product = item.recommended_product
        exists = ServiceOrderPart.objects.filter(
            service_order=order, product=product
        ).exists()
        if exists:
            continue
        part = ServiceOrderPart.objects.create(
            service_order=order,
            product=product,
            quantity=1,
            unit_cost=product.average_cost,
            unit_price=product.sale_price,
            status=ServiceOrderPart.Status.REQUIRED,
            notes=f"Sugerida por checklist: {item.template_item.name}",
        )
        created.append(part.id)

    if created:
        recalculate_totals(order)
    return created
