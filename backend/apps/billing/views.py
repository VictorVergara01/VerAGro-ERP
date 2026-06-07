from rest_framework import filters, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import Invoice, InvoiceLine, Quote, QuoteLine
from .serializers import (
    InvoiceLineSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    QuoteLineSerializer,
    QuoteSerializer,
)
from .services import (
    convert_quote_to_invoice,
    issue_invoice,
    recalculate_invoice,
    recalculate_quote,
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


class QuoteViewSet(viewsets.ModelViewSet):
    serializer_class = QuoteSerializer
    permission_classes = [BillingWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["quote_number", "notes"]

    EDITABLE = (Quote.Status.DRAFT, Quote.Status.SENT)

    def get_queryset(self):
        qs = Quote.objects.select_related("customer").prefetch_related("lines")
        params = self.request.query_params
        for key, field in (
            ("customer", "customer_id"),
            ("service_order", "service_order_id"),
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
        if self.get_object().status not in self.EDITABLE:
            raise ValidationError({"status": "La cotización no es editable."})
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        quote = self.get_object()
        if quote.status not in (Quote.Status.DRAFT, Quote.Status.SENT):
            raise ValidationError({"status": "Solo se aprueba una cotización en borrador o enviada."})
        quote.status = Quote.Status.APPROVED
        quote.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(quote).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        quote = self.get_object()
        if quote.status in (Quote.Status.CONVERTED, Quote.Status.REJECTED):
            raise ValidationError({"status": "La cotización no puede rechazarse."})
        quote.status = Quote.Status.REJECTED
        quote.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(quote).data)

    @action(detail=True, methods=["post"], url_path="convert-to-invoice")
    def convert_to_invoice(self, request, pk=None):
        quote = self.get_object()
        invoice = convert_quote_to_invoice(quote=quote, user=request.user)
        return Response(
            InvoiceSerializer(invoice).data, status=http_status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        from .pdf import render_quote_pdf

        quote = self.get_object()
        download = request.query_params.get("download") in ("1", "true", "yes")
        return render_quote_pdf(quote, download=download)


class QuoteLineViewSet(viewsets.ModelViewSet):
    serializer_class = QuoteLineSerializer
    permission_classes = [BillingWrite]

    def get_queryset(self):
        qs = QuoteLine.objects.select_related("product", "quote")
        quote = _int_param(self.request.query_params, "quote")
        if quote is not None:
            qs = qs.filter(quote_id=quote)
        return qs

    def _assert_editable(self, quote):
        if quote.status not in (Quote.Status.DRAFT, Quote.Status.SENT):
            raise ValidationError({"status": "La cotización no es editable."})

    def perform_create(self, serializer):
        quote = serializer.validated_data.get("quote")
        if quote is None:
            raise ValidationError({"quote": "Este campo es obligatorio."})
        self._assert_editable(quote)
        serializer.save()
        recalculate_quote(quote)

    def perform_update(self, serializer):
        self._assert_editable(serializer.instance.quote)
        line = serializer.save()
        recalculate_quote(line.quote)

    def perform_destroy(self, instance):
        quote = instance.quote
        self._assert_editable(quote)
        instance.delete()
        recalculate_quote(quote)


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
            "lines", "payments"
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

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        invoice = self.get_object()
        issue_invoice(invoice=invoice, user=request.user)
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status in (Invoice.Status.PAID, Invoice.Status.CANCELLED):
            raise ValidationError({"status": "No se puede cancelar una factura pagada o cancelada."})
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])
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
