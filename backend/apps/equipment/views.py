from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .models import Equipment, EquipmentType
from .serializers import EquipmentSerializer, EquipmentTypeSerializer


class EquipmentTypeViewSet(viewsets.ModelViewSet):
    """CRUD de tipos de equipo (lookup). Lectura para todos; escritura admin/inventory.

    Sin paginación: el listado alimenta selectores. Soft-delete vía is_active.
    """

    serializer_class = EquipmentTypeSerializer
    permission_classes = [RoleWriteOrReadOnly("admin", "inventory")]
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
    permission_classes = [
        RoleWriteOrReadOnly("admin", "technician", "sales", "inventory")
    ]
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
