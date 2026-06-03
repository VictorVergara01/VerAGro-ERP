from rest_framework import filters, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly
from apps.inventory.services import release_reservation

from .models import ServiceOrder, ServiceOrderPart
from .serializers import ServiceOrderPartSerializer, ServiceOrderSerializer
from .services import cancel_order, finish_order, recalculate_totals, reserve_parts

ServiceWrite = RoleWriteOrReadOnly("admin", "technician")

TERMINAL_STATUSES = (
    ServiceOrder.Status.FINISHED,
    ServiceOrder.Status.INVOICED,
    ServiceOrder.Status.DELIVERED,
    ServiceOrder.Status.CANCELLED,
)


def _int_param(params, key):
    value = params.get(key)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Debe ser un id numérico."})


def _assert_not_terminal(order):
    if order.status in TERMINAL_STATUSES:
        raise ValidationError(
            {"status": "La orden no admite cambios en su estado actual."}
        )


def _transition(order, allowed_from, new_status, **extra):
    if order.status not in allowed_from:
        raise ValidationError(
            {
                "status": (
                    f"Transición no permitida desde '{order.status}' "
                    f"hacia '{new_status}'."
                )
            }
        )
    order.status = new_status
    for field, value in extra.items():
        setattr(order, field, value)
    order.save(update_fields=["status", *extra.keys(), "updated_at"])
    return order


class ServiceOrderViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceOrderSerializer
    permission_classes = [ServiceWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["service_order_number", "customer_complaint"]

    def get_queryset(self):
        qs = ServiceOrder.objects.select_related(
            "customer", "equipment", "technician"
        ).prefetch_related("parts__product")
        params = self.request.query_params
        for key, field in (
            ("customer", "customer_id"),
            ("equipment", "equipment_id"),
            ("technician", "technician_id"),
        ):
            value = _int_param(params, key)
            if value is not None:
                qs = qs.filter(**{field: value})
        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        _assert_not_terminal(self.get_object())
        return super().update(request, *args, **kwargs)

    # --- Transiciones de estado ---
    @action(detail=True, methods=["post"], url_path="start-diagnostic")
    def start_diagnostic(self, request, pk=None):
        order = self.get_object()
        _transition(order, (ServiceOrder.Status.RECEIVED,), ServiceOrder.Status.IN_DIAGNOSTIC)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        order = self.get_object()
        _transition(
            order,
            (ServiceOrder.Status.IN_DIAGNOSTIC, ServiceOrder.Status.QUOTED),
            ServiceOrder.Status.APPROVED,
        )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"], url_path="start-work")
    def start_work(self, request, pk=None):
        order = self.get_object()
        _transition(
            order,
            (ServiceOrder.Status.APPROVED, ServiceOrder.Status.WAITING_PARTS),
            ServiceOrder.Status.IN_PROGRESS,
        )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def deliver(self, request, pk=None):
        from django.utils import timezone

        order = self.get_object()
        _transition(
            order,
            (ServiceOrder.Status.FINISHED, ServiceOrder.Status.INVOICED),
            ServiceOrder.Status.DELIVERED,
            delivered_date=timezone.localdate(),
        )
        return Response(self.get_serializer(order).data)

    # --- Piezas e inventario ---
    @action(detail=True, methods=["post"], url_path="add-part")
    def add_part(self, request, pk=None):
        order = self.get_object()
        _assert_not_terminal(order)
        data = {**request.data, "service_order": order.id}
        serializer = ServiceOrderPartSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        part = serializer.save()
        recalculate_totals(order)
        part.refresh_from_db()
        return Response(
            ServiceOrderPartSerializer(part).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="reserve-parts")
    def reserve_parts_action(self, request, pk=None):
        order = self.get_object()
        _assert_not_terminal(order)
        summary = reserve_parts(order, user=request.user)
        order.refresh_from_db()
        return Response({**summary, "status": order.status})

    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        order = self.get_object()
        finish_order(order, user=request.user)
        order.refresh_from_db()
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        cancel_order(order, user=request.user)
        order.refresh_from_db()
        return Response(self.get_serializer(order).data)

    # --- Stubs de módulos diferidos (reservan la ruta del doc §7.7) ---
    @action(detail=True, methods=["post"], url_path="generate-quote")
    def generate_quote(self, request, pk=None):
        self.get_object()
        return Response(
            {"detail": "Pendiente: módulo de cotizaciones."},
            status=http_status.HTTP_501_NOT_IMPLEMENTED,
        )

    @action(detail=True, methods=["post"], url_path="generate-invoice")
    def generate_invoice(self, request, pk=None):
        self.get_object()
        return Response(
            {"detail": "Pendiente: módulo de facturación."},
            status=http_status.HTTP_501_NOT_IMPLEMENTED,
        )


class ServiceOrderPartViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceOrderPartSerializer
    permission_classes = [ServiceWrite]

    EDITABLE_PART_STATUSES = (
        ServiceOrderPart.Status.REQUIRED,
        ServiceOrderPart.Status.PENDING_PURCHASE,
    )

    def get_queryset(self):
        qs = ServiceOrderPart.objects.select_related("product", "service_order")
        order = _int_param(self.request.query_params, "service_order")
        if order is not None:
            qs = qs.filter(service_order_id=order)
        return qs

    def perform_create(self, serializer):
        order = serializer.validated_data.get("service_order")
        if order is None:
            raise ValidationError({"service_order": "Este campo es obligatorio."})
        _assert_not_terminal(order)
        serializer.save()
        recalculate_totals(order)

    def perform_update(self, serializer):
        part = serializer.instance
        _assert_not_terminal(part.service_order)
        if part.status not in self.EDITABLE_PART_STATUSES:
            raise ValidationError(
                {"status": "Solo se editan piezas requeridas o pendientes de compra."}
            )
        part = serializer.save()
        recalculate_totals(part.service_order)

    def perform_destroy(self, instance):
        order = instance.service_order
        _assert_not_terminal(order)
        # Borrar una pieza reservada libera su reserva en inventario.
        if instance.status == ServiceOrderPart.Status.RESERVED:
            release_reservation(
                product=instance.product,
                quantity=instance.quantity,
                reference_type="service_order",
                reference_id=order.id,
                notes=f"Baja de pieza orden {order.service_order_number}",
            )
        instance.delete()
        recalculate_totals(order)
