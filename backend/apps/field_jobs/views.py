from rest_framework import filters, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction
from drf_spectacular.utils import extend_schema

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import FieldJob, FieldPlot
from .serializers import FieldJobSerializer, FieldPlotSerializer, FieldJobCompletionSerializer
from .services import calculate_mix, cancel_job, mark_done

FieldJobWrite = RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)


def _int_param(params, key):
    value = params.get(key)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Debe ser un id numérico."})


def _date_param(params, key):
    value = params.get(key)
    if not value:
        return None
    from datetime import date

    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Fecha inválida (use YYYY-MM-DD)."})


class FieldJobViewSet(viewsets.ModelViewSet):
    serializer_class = FieldJobSerializer
    permission_classes = [FieldJobWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["number", "location", "crop", "customer__name"]

    def perform_destroy(self, instance):
        if instance.status != FieldJob.Status.SCHEDULED:
            raise ValidationError({"status": "Solo se eliminan trabajos programados; cancela los demás para conservar su historial."})
        instance.delete()

    def get_queryset(self):
        qs = FieldJob.objects.select_related(
            "customer", "plot", "equipment", "pilot"
        ).prefetch_related("invoices", "products")
        params = self.request.query_params
        for key, field in (
            ("customer", "customer_id"),
            ("equipment", "equipment_id"),
            ("pilot", "pilot_id"),
        ):
            value = _int_param(params, key)
            if value is not None:
                qs = qs.filter(**{field: value})
        for key in ("status", "job_type"):
            value = params.get(key)
            if value:
                qs = qs.filter(**{key: value})
        date_from = _date_param(params, "from")
        if date_from is not None:
            qs = qs.filter(scheduled_date__gte=date_from)
        date_to = _date_param(params, "to")
        if date_to is not None:
            qs = qs.filter(scheduled_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        extra = {"created_by": self.request.user}
        job = serializer.save(**extra)
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.instance = FieldJob.objects.select_for_update().get(pk=serializer.instance.pk)
        if serializer.instance.status != FieldJob.Status.SCHEDULED:
            raise ValidationError({"status": "Solo se edita la programación de trabajos pendientes."})
        extra = {}
        job = serializer.save(**extra)
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])

    @extend_schema(request=FieldJobCompletionSerializer, responses=FieldJobSerializer)
    @action(detail=True, methods=["post"], url_path="mark-done")
    def mark_done_action(self, request, pk=None):
        job = self.get_object()
        mark_done(job, user=request.user, actual_hectares=request.data.get("actual_hectares"),
                  applied_quintals=request.data.get("applied_quintals"), done_date=request.data.get("done_date"), due_date=request.data.get('due_date'))
        job.refresh_from_db()
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        job = self.get_object()
        cancel_job(job, user=request.user)
        job.refresh_from_db()
        return Response(self.get_serializer(job).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="generate-invoice",
        permission_classes=[RoleWriteOrReadOnly(*roles.BILLING_WRITE)],
    )
    def generate_invoice(self, request, pk=None):
        from apps.billing.serializers import InvoiceSerializer
        from apps.billing.services import create_invoice_from_field_job

        job = self.get_object()
        invoice = create_invoice_from_field_job(job=job, user=request.user)
        return Response(
            InvoiceSerializer(invoice).data, status=http_status.HTTP_201_CREATED
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="calculate-mix",
        permission_classes=[IsAuthenticated],
    )
    def calculate_mix_action(self, request):
        data = request.data
        result = calculate_mix(
            hectares=data.get("hectares"),
            caldo_per_hectare=data.get("caldo_per_hectare"),
            tank_volume_liters=data.get("tank_volume_liters"),
            products=data.get("products") or [],
        )
        return Response(result)


class FieldPlotViewSet(viewsets.ModelViewSet):
    """Lotes de un cliente. Sin paginación: alimenta el selector del trabajo."""

    serializer_class = FieldPlotSerializer
    permission_classes = [FieldJobWrite]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "location"]

    def get_queryset(self):
        qs = FieldPlot.objects.select_related("customer").prefetch_related("products")
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        customer = _int_param(self.request.query_params, "customer")
        if customer is not None:
            qs = qs.filter(customer_id=customer)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
