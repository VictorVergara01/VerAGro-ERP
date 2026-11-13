from rest_framework import filters, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from django.db import transaction

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import Invoice, InvoiceLine
from .serializers import (
    InvoiceLineSerializer,
    InvoiceSerializer,
    PaymentSerializer,
)
from .services import (
    issue_invoice,
    recalculate_invoice,
    record_payment,
)

BillingWrite = RoleWriteOrReadOnly(*roles.BILLING_WRITE)


def _int_param(params, key):
    value = params.get(key)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Debe ser un id numérico."})


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [BillingWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["invoice_number", "notes"]

    def get_permissions(self):
        if self.action == "payments":
            return [RoleWriteOrReadOnly(*roles.PAYMENTS_WRITE)()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Invoice.objects.select_related("customer").prefetch_related(
            "lines__product", "payments"
        )
        params = self.request.query_params
        for key, field in (
            ("customer", "customer_id"),
            ("service_order", "service_order_id"),
        ):
            value = _int_param(params, key)
            if value is not None:
                qs = qs.filter(**{field: value})
        for key, field in (("status", "status"), ("invoice_type", "invoice_type")):
            value = params.get(key)
            if value:
                qs = qs.filter(**{field: value})
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        if self.get_object().status != Invoice.Status.DRAFT:
            raise ValidationError({"status": "Solo se edita una factura en borrador."})
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if instance.field_job_id:
            raise ValidationError('Conserva la factura vinculada al trabajo; puedes cancelarla si no tiene cobros.')
        if instance.status != Invoice.Status.DRAFT:
            raise ValidationError('Solo se eliminan facturas en borrador.')
        instance.delete()

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        invoice = self.get_object()
        issue_invoice(invoice=invoice, user=request.user)
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        if invoice.field_job_id:
            from apps.field_jobs.models import FieldJob
            FieldJob.objects.select_for_update().get(pk=invoice.field_job_id)
            invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
            if invoice.payments.exists():
                raise ValidationError('El trabajo tiene cobros registrados; conserva la factura y sus comprobantes.')
        if invoice.status in (Invoice.Status.PAID, Invoice.Status.CANCELLED):
            raise ValidationError({"status": "No se puede cancelar una factura pagada o cancelada."})
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])

        from apps.fiscal.services import void_fiscal_document

        void_fiscal_document(invoice=invoice)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get", "post"])
    def payments(self, request, pk=None):
        invoice = self.get_object()
        if request.method == "POST":
            data = request.data
            record_payment(
                invoice=invoice,
                amount=data.get("amount"),
                method=data.get("method", "cash"),
                payment_date=data.get("payment_date"),
                reference_number=data.get("reference_number", ""),
                notes=data.get("notes", ""),
                user=request.user,
                request_id=data.get('request_id'),
            )
            invoice.refresh_from_db()
            return Response(
                self.get_serializer(invoice).data, status=http_status.HTTP_201_CREATED
            )
        return Response(PaymentSerializer(invoice.payments.all(), many=True).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        from .pdf import render_invoice_pdf

        invoice = self.get_object()
        download = request.query_params.get("download") in ("1", "true", "yes")
        return render_invoice_pdf(invoice, download=download)

    @action(detail=True, methods=["post"], url_path="emit-fiscal")
    def emit_fiscal(self, request, pk=None):
        from apps.fiscal.services import emit_fiscal_document

        invoice = self.get_object()
        emit_fiscal_document(invoice=invoice, user=request.user)
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get"])
    def cafe(self, request, pk=None):
        from apps.fiscal.cafe import render_cafe

        invoice = self.get_object()
        if getattr(invoice, "fiscal", None) is None:
            raise ValidationError({"detail": "La factura no tiene documento fiscal."})
        download = request.query_params.get("download") in ("1", "true", "yes")
        return render_cafe(invoice, download=download)


class InvoiceLineViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceLineSerializer
    permission_classes = [BillingWrite]

    def get_queryset(self):
        qs = InvoiceLine.objects.select_related("product", "invoice")
        invoice = _int_param(self.request.query_params, "invoice")
        if invoice is not None:
            qs = qs.filter(invoice_id=invoice)
        return qs

    def _assert_editable(self, invoice):
        if invoice.field_job_id:
            raise ValidationError('Los importes de campo se conservan según el cierre del trabajo.')
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError({"status": "Solo se edita una factura en borrador."})

    def perform_create(self, serializer):
        invoice = serializer.validated_data.get("invoice")
        if invoice is None:
            raise ValidationError({"invoice": "Este campo es obligatorio."})
        self._assert_editable(invoice)
        serializer.save()
        recalculate_invoice(invoice)

    def perform_update(self, serializer):
        self._assert_editable(serializer.instance.invoice)
        line = serializer.save()
        recalculate_invoice(line.invoice)

    def perform_destroy(self, instance):
        invoice = instance.invoice
        self._assert_editable(invoice)
        instance.delete()
        recalculate_invoice(invoice)
