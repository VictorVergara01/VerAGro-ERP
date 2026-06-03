from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .models import Supplier, SupplierProduct
from .serializers import SupplierProductSerializer, SupplierSerializer

SuppliersWrite = RoleWriteOrReadOnly("admin", "inventory")


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [SuppliersWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "legal_name", "email", "contact_person"]

    def get_queryset(self):
        qs = Supplier.objects.all()
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get", "post"])
    def products(self, request, pk=None):
        supplier = self.get_object()
        if request.method == "POST":
            data = {**request.data, "supplier": supplier.id}
            serializer = SupplierProductSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=201)
        qs = supplier.supplier_products.select_related("product", "supplier")
        return Response(SupplierProductSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="purchase-history")
    def purchase_history(self, request, pk=None):
        from apps.purchasing.serializers import PurchaseOrderSummarySerializer

        supplier = self.get_object()
        qs = supplier.purchase_orders.all()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = PurchaseOrderSummarySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(PurchaseOrderSummarySerializer(qs, many=True).data)


class SupplierProductViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierProductSerializer
    permission_classes = [SuppliersWrite]

    def get_queryset(self):
        qs = SupplierProduct.objects.select_related("product", "supplier")
        params = self.request.query_params
        supplier = params.get("supplier")
        if supplier:
            try:
                qs = qs.filter(supplier_id=int(supplier))
            except (TypeError, ValueError):
                raise ValidationError({"supplier": "Debe ser un id numérico."})
        product = params.get("product")
        if product:
            try:
                qs = qs.filter(product_id=int(product))
            except (TypeError, ValueError):
                raise ValidationError({"product": "Debe ser un id numérico."})
        is_preferred = params.get("is_preferred")
        if is_preferred:  # ignora "" (param presente sin valor) => no filtra
            qs = qs.filter(is_preferred=is_preferred.lower() in ("1", "true", "yes", "on"))
        return qs
