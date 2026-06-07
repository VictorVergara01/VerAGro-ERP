from django.utils import timezone
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import (
    ChecklistTemplate,
    ChecklistTemplateItem,
    ServiceChecklist,
    ServiceChecklistItem,
)
from .serializers import (
    ChecklistTemplateItemSerializer,
    ChecklistTemplateSerializer,
    ServiceChecklistItemSerializer,
    ServiceChecklistSerializer,
)
from .services import apply_recommended_parts

TemplateWrite = RoleWriteOrReadOnly(*roles.CHECKLIST_TEMPLATE_WRITE)
ChecklistWrite = RoleWriteOrReadOnly(*roles.SERVICE_WRITE)


def _int_param(params, key):
    value = params.get(key)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Debe ser un id numérico."})


class ChecklistTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = ChecklistTemplateSerializer
    permission_classes = [TemplateWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        qs = ChecklistTemplate.objects.prefetch_related("items").all()
        equipment_type = _int_param(self.request.query_params, "equipment_type")
        if equipment_type is not None:
            qs = qs.filter(equipment_type_id=equipment_type)
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class ChecklistTemplateItemViewSet(viewsets.ModelViewSet):
    serializer_class = ChecklistTemplateItemSerializer
    permission_classes = [TemplateWrite]

    def get_queryset(self):
        qs = ChecklistTemplateItem.objects.select_related("template")
        template = _int_param(self.request.query_params, "template")
        if template is not None:
            qs = qs.filter(template_id=template)
        return qs

    def perform_create(self, serializer):
        if serializer.validated_data.get("template") is None:
            raise ValidationError({"template": "Este campo es obligatorio."})
        serializer.save()


class ServiceChecklistViewSet(
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ServiceChecklistSerializer
    permission_classes = [ChecklistWrite]

    def get_queryset(self):
        qs = ServiceChecklist.objects.select_related(
            "checklist_template", "service_order"
        ).prefetch_related("items__template_item", "items__recommended_product")
        service_order = _int_param(self.request.query_params, "service_order")
        if service_order is not None:
            qs = qs.filter(service_order_id=service_order)
        return qs

    @action(detail=True, methods=["post"])
    def fill(self, request, pk=None):
        """Llenado masivo de ítems: body {items:[{id, status, notes, priority,
        recommended_product}]}. Valida cada ítem y agrega piezas recomendadas."""
        checklist = self.get_object()
        items_data = request.data.get("items", [])
        if not isinstance(items_data, list) or not items_data:
            raise ValidationError({"items": "Envíe una lista de ítems a actualizar."})
        by_id = {item.id: item for item in checklist.items.all()}
        for entry in items_data:
            item = by_id.get(entry.get("id"))
            if item is None:
                raise ValidationError(
                    {"items": f"El ítem {entry.get('id')} no pertenece al checklist."}
                )
            serializer = ServiceChecklistItemSerializer(
                item, data=entry, partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
        apply_recommended_parts(checklist, user=request.user)
        checklist.refresh_from_db()
        return Response(self.get_serializer(checklist).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        checklist = self.get_object()
        checklist.completed_by = request.user
        checklist.completed_at = timezone.now()
        checklist.save(update_fields=["completed_by", "completed_at", "updated_at"])
        return Response(self.get_serializer(checklist).data)


class ServiceChecklistItemViewSet(
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ServiceChecklistItemSerializer
    permission_classes = [ChecklistWrite]

    def get_queryset(self):
        qs = ServiceChecklistItem.objects.select_related(
            "template_item", "recommended_product", "service_checklist"
        )
        checklist = _int_param(self.request.query_params, "service_checklist")
        if checklist is not None:
            qs = qs.filter(service_checklist_id=checklist)
        return qs

    def perform_update(self, serializer):
        item = serializer.save()
        apply_recommended_parts(item.service_checklist, user=self.request.user)
