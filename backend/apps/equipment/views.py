from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import Equipment, EquipmentType, EquipmentModel, EquipmentComponent
from .serializers import EquipmentSerializer, EquipmentTypeSerializer
from .catalog_serializers import (
    EquipmentModelSerializer,
    EquipmentComponentSerializer,
    serialize_component_tree,
)


class EquipmentTypeViewSet(viewsets.ModelViewSet):
    """CRUD de tipos de equipo (lookup). Lectura para todos; escritura admin/inventory.

    Sin paginación: el listado alimenta selectores. Soft-delete vía is_active.
    """

    serializer_class = EquipmentTypeSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.LOOKUPS_WRITE)]
    pagination_class = None

    def get_queryset(self):
        qs = EquipmentType.objects.all()
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class EquipmentViewSet(viewsets.ModelViewSet):
    """CRUD de equipos con búsqueda, filtros y soft-delete vía status=retired."""

    serializer_class = EquipmentSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.EQUIPMENT_WRITE)]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "serial_number", "internal_code", "brand", "model"]

    def get_queryset(self):
        qs = Equipment.objects.all()
        params = self.request.query_params
        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        customer_param = params.get("customer")
        if customer_param:
            try:
                qs = qs.filter(customer_id=int(customer_param))
            except (TypeError, ValueError):
                raise ValidationError({"customer": "Debe ser un id numérico."})
        type_param = params.get("equipment_type")
        if type_param:
            try:
                qs = qs.filter(equipment_type_id=int(type_param))
            except (TypeError, ValueError):
                raise ValidationError(
                    {"equipment_type": "Debe ser un id numérico."}
                )
        return qs

    def perform_destroy(self, instance):
        instance.status = Equipment.Status.RETIRED
        instance.save(update_fields=["status", "updated_at"])

    @action(detail=True, methods=["get"], url_path="service-history")
    def service_history(self, request, pk=None):
        from apps.service_orders.serializers import ServiceOrderSummarySerializer

        equipment = self.get_object()
        qs = equipment.service_orders.all()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ServiceOrderSummarySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(ServiceOrderSummarySerializer(qs, many=True).data)


class EquipmentModelViewSet(viewsets.ModelViewSet):
    """CRUD de modelos técnicos. Lectura para todos; escritura admin/inventory.
    Sin paginación (alimenta selectores). Soft-delete vía is_active."""

    serializer_class = EquipmentModelSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.LOOKUPS_WRITE)]
    pagination_class = None

    def get_queryset(self):
        qs = EquipmentModel.objects.select_related("equipment_type")
        params = self.request.query_params
        if params.get("include_inactive", "").lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        etype = params.get("equipment_type")
        if etype:
            try:
                qs = qs.filter(equipment_type_id=int(etype))
            except (TypeError, ValueError):
                raise ValidationError({"equipment_type": "Debe ser un id numérico."})
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get"], url_path="component-tree")
    def component_tree(self, request, pk=None):
        model = self.get_object()
        components = model.components.filter(is_active=True)
        return Response(serialize_component_tree(components))


class EquipmentComponentViewSet(viewsets.ModelViewSet):
    """CRUD de componentes del árbol. Lectura para todos; escritura admin/inventory.
    Sin paginación (alimenta el árbol/selectores). Soft-delete vía is_active."""

    serializer_class = EquipmentComponentSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.LOOKUPS_WRITE)]
    pagination_class = None

    def get_queryset(self):
        qs = EquipmentComponent.objects.select_related("parent", "equipment_model")
        params = self.request.query_params
        if params.get("include_inactive", "").lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        model = params.get("equipment_model")
        if model:
            try:
                qs = qs.filter(equipment_model_id=int(model))
            except (TypeError, ValueError):
                raise ValidationError({"equipment_model": "Debe ser un id numérico."})
        parent = params.get("parent")
        if parent:
            try:
                qs = qs.filter(parent_id=int(parent))
            except (TypeError, ValueError):
                raise ValidationError({"parent": "Debe ser un id numérico."})
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
