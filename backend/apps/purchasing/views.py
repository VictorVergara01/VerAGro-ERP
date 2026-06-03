from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .models import PurchaseAdditionalCost, PurchaseOrder, PurchaseOrderLine
from .serializers import (
    PurchaseAdditionalCostSerializer,
    PurchaseOrderLineSerializer,
    PurchaseOrderSerializer,
)
from .services import receive_lines, recalculate_costs

PurchasingWrite = RoleWriteOrReadOnly("admin", "inventory")

EDITABLE_STATUSES = (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.SENT)


def _int_param(params, key):
    value = params.get(key)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Debe ser un id numérico."})


def _assert_editable(order):
    if order.status not in EDITABLE_STATUSES:
        raise ValidationError(
            {"status": "La orden no es editable en su estado actual (debe ser borrador o enviada)."}
        )


def _required_order(serializer):
    order = serializer.validated_data.get("purchase_order")
    if order is None:
        raise ValidationError({"purchase_order": "Este campo es obligatorio."})
    return order


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [PurchasingWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["order_number", "notes"]

    def get_queryset(self):
        qs = (
            PurchaseOrder.objects.select_related("supplier")
            .prefetch_related("lines", "additional_costs")
            .all()
        )
        supplier = _int_param(self.request.query_params, "supplier")
        if supplier is not None:
            qs = qs.filter(supplier_id=supplier)
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        _assert_editable(self.get_object())
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if instance.status != PurchaseOrder.Status.DRAFT:
            raise ValidationError(
                {"status": "Solo se pueden eliminar órdenes en borrador."}
            )
        instance.delete()

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        order = self.get_object()
        _assert_editable(order)
        recalculate_costs(order)
        order.refresh_from_db()
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        order = self.get_object()
        if order.status != PurchaseOrder.Status.DRAFT:
            raise ValidationError({"status": "Solo se puede enviar una orden en borrador."})
        order.status = PurchaseOrder.Status.SENT
        order.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        order = self.get_object()
        if request.data.get("receive_all"):
            receipts = [
                {"line": line.id, "quantity": line.quantity_ordered - line.quantity_received}
                for line in order.lines.all()
                if line.quantity_ordered - line.quantity_received > 0
            ]
        else:
            receipts = request.data.get("receipts", [])
            if not receipts:
                raise ValidationError(
                    {"receipts": "Indique las líneas a recibir o use receive_all."}
                )
        receive_lines(purchase_order=order, receipts=receipts, user=request.user)
        order.refresh_from_db()
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status in (PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.CANCELLED):
            raise ValidationError(
                {"status": "No se puede cancelar una orden recibida o ya cancelada."}
            )
        order.status = PurchaseOrder.Status.CANCELLED
        order.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(order).data)


class PurchaseOrderLineViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderLineSerializer
    permission_classes = [PurchasingWrite]

    def get_queryset(self):
        qs = PurchaseOrderLine.objects.select_related("product", "purchase_order")
        order = _int_param(self.request.query_params, "purchase_order")
        if order is not None:
            qs = qs.filter(purchase_order_id=order)
        return qs

    def perform_create(self, serializer):
        order = _required_order(serializer)
        _assert_editable(order)
        serializer.save()
        recalculate_costs(order)

    def perform_update(self, serializer):
        _assert_editable(serializer.instance.purchase_order)
        line = serializer.save()
        recalculate_costs(line.purchase_order)

    def perform_destroy(self, instance):
        order = instance.purchase_order
        _assert_editable(order)
        instance.delete()
        recalculate_costs(order)


class PurchaseAdditionalCostViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseAdditionalCostSerializer
    permission_classes = [PurchasingWrite]

    def get_queryset(self):
        qs = PurchaseAdditionalCost.objects.select_related("purchase_order")
        order = _int_param(self.request.query_params, "purchase_order")
        if order is not None:
            qs = qs.filter(purchase_order_id=order)
        return qs

    def perform_create(self, serializer):
        order = _required_order(serializer)
        _assert_editable(order)
        serializer.save()
        recalculate_costs(order)

    def perform_update(self, serializer):
        _assert_editable(serializer.instance.purchase_order)
        cost = serializer.save()
        recalculate_costs(cost.purchase_order)

    def perform_destroy(self, instance):
        order = instance.purchase_order
        _assert_editable(order)
        instance.delete()
        recalculate_costs(order)
