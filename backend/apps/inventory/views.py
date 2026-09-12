from django.db.models import F
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .import_export import export_products_csv, import_products_csv
from .models import InventoryMovement, Product, ProductCategory, ProductCompatibility
from .serializers import (
    AdjustmentSerializer,
    CostHistoryEntrySerializer,
    InventoryMovementSerializer,
    ProductCategorySerializer,
    ProductCompatibilitySerializer,
    ProductSerializer,
)

InventoryWrite = RoleWriteOrReadOnly(*roles.INVENTORY_WRITE)

COST_HISTORY_TYPES = (
    InventoryMovement.MovementType.PURCHASE_IN,
    InventoryMovement.MovementType.ADJUSTMENT_IN,
    InventoryMovement.MovementType.RETURN_IN,
)


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
        equipment_type = params.get("equipment_type")
        if equipment_type:
            try:
                qs = qs.filter(
                    compatible_equipment_types__id=int(equipment_type)
                ).distinct()
            except (TypeError, ValueError):
                raise ValidationError(
                    {"equipment_type": "Debe ser un id numérico."}
                )
        equipment_model = params.get("equipment_model")
        if equipment_model:
            try:
                qs = qs.filter(
                    compatibilities__equipment_model_id=int(equipment_model)
                ).distinct()
            except (TypeError, ValueError):
                raise ValidationError({"equipment_model": "Debe ser un id numérico."})
        component = params.get("component")
        if component:
            try:
                qs = qs.filter(compatibilities__component_id=int(component)).distinct()
            except (TypeError, ValueError):
                raise ValidationError({"component": "Debe ser un id numérico."})
        compatible_with = params.get("compatible_with_equipment")
        if compatible_with:
            from apps.equipment.models import Equipment

            try:
                equipment = Equipment.objects.filter(id=int(compatible_with)).first()
            except (TypeError, ValueError):
                raise ValidationError(
                    {"compatible_with_equipment": "Debe ser un id numérico."}
                )
            model_id = equipment.catalog_model_id if equipment else None
            # Sin equipo o sin modelo técnico → sin resultados compatibles.
            qs = (
                qs.filter(compatibilities__equipment_model_id=model_id).distinct()
                if model_id
                else qs.none()
            )
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get"])
    def movements(self, request, pk=None):
        product = self.get_object()
        qs = product.movements.all()
        return Response(InventoryMovementSerializer(qs, many=True).data)

    @extend_schema(responses=CostHistoryEntrySerializer(many=True))
    # pagination_class=None: la acción devuelve la lista completa sin paginar
    # (no llama a self.paginate_queryset); sin esto, drf-spectacular hereda el
    # paginador del ViewSet y anuncia un envoltorio {count, next, previous,
    # results} que la respuesta real nunca tiene.
    @action(detail=True, methods=["get"], url_path="cost-history", pagination_class=None)
    def cost_history(self, request, pk=None):
        """Historial de costos: sólo entradas, con el desglose de su compra."""
        product = self.get_object()
        qs = (
            product.movements.filter(movement_type__in=COST_HISTORY_TYPES)
            .select_related(
                "purchase_order_line__purchase_order__supplier",
            )
            .order_by("-created_at", "-id")
        )
        return Response(CostHistoryEntrySerializer(qs, many=True).data)

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


class ProductCompatibilityViewSet(viewsets.ModelViewSet):
    """CRUD de compatibilidades pieza↔modelo↔componente. Escritura admin/inventory."""

    serializer_class = ProductCompatibilitySerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.INVENTORY_WRITE)]

    def get_queryset(self):
        qs = ProductCompatibility.objects.select_related(
            "product", "equipment_model", "component"
        )
        params = self.request.query_params
        for key, field in (
            ("product", "product_id"),
            ("equipment_model", "equipment_model_id"),
            ("component", "component_id"),
        ):
            value = params.get(key)
            if value:
                try:
                    qs = qs.filter(**{field: int(value)})
                except (TypeError, ValueError):
                    raise ValidationError({key: "Debe ser un id numérico."})
        return qs
