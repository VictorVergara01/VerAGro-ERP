from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "identification_number", "phone", "email"]

    def get_queryset(self):
        qs = Customer.objects.all()
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get"], url_path="service-orders")
    def service_orders(self, request, pk=None):
        from apps.service_orders.serializers import ServiceOrderSummarySerializer

        customer = self.get_object()
        qs = customer.service_orders.all()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ServiceOrderSummarySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(ServiceOrderSummarySerializer(qs, many=True).data)

    # Placeholders: devuelven vacío hasta que existan los módulos correspondientes.

    @action(detail=True, methods=["get"])
    def invoices(self, request, pk=None):
        from apps.billing.serializers import InvoiceSummarySerializer

        customer = self.get_object()
        qs = customer.invoices.all()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = InvoiceSummarySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(InvoiceSummarySerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def equipment(self, request, pk=None):
        self.get_object()
        return Response([])  # TODO: conectar con módulo equipment
