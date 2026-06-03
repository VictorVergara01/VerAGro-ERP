from django.db.models import F
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

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


class CategoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return ProductCategory.objects.filter(is_active=True)
