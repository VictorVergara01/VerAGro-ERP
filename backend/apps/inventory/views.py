from django.db.models import F
from django.http import HttpResponse
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .import_export import export_products_csv, import_products_csv
from .models import Product, ProductCategory
from .serializers import (
    AdjustmentSerializer,
    InventoryMovementSerializer,
    ProductCategorySerializer,
    ProductSerializer,
)

InventoryWrite = RoleWriteOrReadOnly("admin", "inventory")


class ProductViewSet(viewsets.ModelViewSet):
    """CRUD de productos. stock/reserved son read-only: cambian vía ajustes/movimientos."""

    serializer_class = ProductSerializer
    permission_classes = [InventoryWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["sku", "name", "barcode", "brand", "model"]

    def get_queryset(self):
        qs = Product.objects.prefetch_related("compatible_equipment_types")
        params = self.request.query_params
        include_inactive = params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        category = params.get("category")
        if category:
            try:
                qs = qs.filter(category_id=int(category))
            except (TypeError, ValueError):
                raise ValidationError({"category": "Debe ser un id numérico."})
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get"])
    def movements(self, request, pk=None):
        product = self.get_object()
        qs = product.movements.all()
        return Response(InventoryMovementSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        content = export_products_csv()
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="inventario.csv"'
        return response

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser],
        url_path="import",
    )
    def import_csv(self, request):
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Suba un archivo CSV."})
        result = import_products_csv(upload, request.user)
        return Response(result)


class AdjustmentCreateView(CreateAPIView):
    serializer_class = AdjustmentSerializer
    permission_classes = [InventoryWrite]


class LowStockListView(ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            Product.objects.filter(is_active=True, minimum_stock__gt=0)
            .prefetch_related("compatible_equipment_types")
            .annotate(available=F("stock_quantity") - F("reserved_quantity"))
            .filter(available__lte=F("minimum_stock"))
        )


class CategoryViewSet(viewsets.ModelViewSet):
    """CRUD de categorías (lookup). Lectura para todos; escritura admin/inventory.

    Sin paginación: alimenta selectores. Soft-delete vía is_active.
    """

    serializer_class = ProductCategorySerializer
    permission_classes = [InventoryWrite]
    pagination_class = None

    def get_queryset(self):
        qs = ProductCategory.objects.all()
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])
