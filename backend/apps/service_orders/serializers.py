from django.db import transaction
from rest_framework import serializers

from apps.inventory.price_range import PriceFloorMixin
from apps.inventory.models import Product

from .models import ServiceOrder, ServiceOrderPart, ServiceOrderPhoto


class ServiceOrderPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceOrderPhoto
        fields = (
            "id",
            "service_order",
            "image",
            "caption",
            "uploaded_by",
            "created_at",
        )
        read_only_fields = ("id", "uploaded_by", "created_at")


class ServiceOrderPartSerializer(PriceFloorMixin, serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True, default="")
    product_name = serializers.SerializerMethodField()

    def get_product_name(self, obj) -> str:
        return obj.description or (obj.product.name if obj.product_id else "")

    component_name = serializers.CharField(source="component.name", read_only=True, default=None)
    component_code = serializers.CharField(source="component.code", read_only=True, default=None)
    component_path = serializers.CharField(source="component.path", read_only=True, default=None)

    class Meta:
        model = ServiceOrderPart
        fields = (
            "id",
            "service_order",
            "product",
            "product_sku",
            "product_name",
            "description",
            "part_number",
            "inventory_source",
            "reconciled_at",
            "reconciled_by",
            "component",
            "component_name",
            "component_code",
            "component_path",
            "quantity",
            "unit_cost",
            "unit_price",
            "price_floor",
            "below_min_price",
            "total_price",
            "status",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "total_price",
            "status",
            "created_at",
            "updated_at",
            "reconciled_at",
            "reconciled_by",
        )
        extra_kwargs = {"service_order": {"required": False}}

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Debe ser mayor que cero.")
        return value

    def validate(self, attrs):
        source = attrs.get("inventory_source", getattr(self.instance, "inventory_source", "inventory"))
        if self.instance is None and source == "counted":
            raise serializers.ValidationError({"inventory_source": "Registra la pieza pendiente y concíliala con el conteo físico."})
        product = attrs.get("product", getattr(self.instance, "product", None))
        description = attrs.get("description", getattr(self.instance, "description", "")).strip()
        if source == "inventory" and product is None:
            raise serializers.ValidationError({"product": "Selecciona un producto o registra la pieza pendiente de inventario."})
        if product is None and not description:
            raise serializers.ValidationError({"description": "Escribe el nombre de la pieza."})
        if self.instance:
            for field in ("service_order", "product", "inventory_source"):
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError({field: "Usa la conciliación para cambiar el origen de una pieza."})
        for field in ("unit_cost", "unit_price"):
            if attrs.get(field, 0) < 0:
                raise serializers.ValidationError({field: "No puede ser negativo."})
        # Defaults de costo/precio desde el producto si no se envían.
        product = attrs.get("product") or getattr(self.instance, "product", None)
        if product is not None and self.instance is None:
            attrs.setdefault("unit_cost", product.average_cost)
            attrs.setdefault("unit_price", product.sale_price)

        # Modo estructurado: si llega componente, validar compatibilidad en backend.
        component = attrs.get("component")
        if component is not None:
            from apps.inventory.models import ProductCompatibility

            order = attrs.get("service_order") or getattr(
                self.instance, "service_order", None
            )
            equipment = getattr(order, "equipment", None) if order else None
            if equipment is None:
                raise serializers.ValidationError(
                    {"component": "La orden no tiene equipo; no se puede usar el despiece."}
                )
            if equipment.catalog_model_id is None:
                raise serializers.ValidationError(
                    {"component": "El equipo no tiene un modelo técnico asignado."}
                )
            if component.equipment_model_id != equipment.catalog_model_id:
                raise serializers.ValidationError(
                    {"component": "El componente no pertenece al modelo del equipo."}
                )
            compatible = ProductCompatibility.objects.filter(
                product=product,
                equipment_model_id=equipment.catalog_model_id,
                component=component,
            ).exists()
            if not compatible:
                raise serializers.ValidationError(
                    {"component": "El producto no es compatible con este componente."}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        order = ServiceOrder.objects.select_for_update().get(pk=validated_data["service_order"].pk)
        if order.status in ("finished", "invoiced", "delivered", "cancelled"):
            raise serializers.ValidationError({"service_order": "La orden ya está cerrada."})
        source = validated_data.get("inventory_source", "inventory")
        if source == "pending":
            validated_data["status"] = ServiceOrderPart.Status.PENDING_INVENTORY
        elif source in ("customer", "external"):
            validated_data["status"] = ServiceOrderPart.Status.USED
        if not validated_data.get("description") and validated_data.get("product"):
            validated_data["description"] = validated_data["product"].name
        return super().create(validated_data)


class ReconcilePartSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=ServiceOrderPart.InventorySource.choices)
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        required=False,
    )


class ServiceOrderSerializer(serializers.ModelSerializer):
    parts = ServiceOrderPartSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    equipment_type = serializers.IntegerField(
        source="equipment.equipment_type_id", read_only=True, allow_null=True
    )
    equipment_type_name = serializers.CharField(
        source="equipment.equipment_type.name", read_only=True, allow_null=True
    )
    equipment_catalog_model = serializers.IntegerField(
        source="equipment.catalog_model_id", read_only=True, allow_null=True
    )
    equipment_catalog_model_name = serializers.CharField(
        source="equipment.catalog_model.name", read_only=True, allow_null=True
    )
    technician_name = serializers.CharField(
        source="technician.full_name", read_only=True
    )

    class Meta:
        model = ServiceOrder
        fields = (
            "id",
            "service_order_number",
            "customer",
            "customer_name",
            "equipment",
            "equipment_name",
            "equipment_type",
            "equipment_type_name",
            "equipment_catalog_model",
            "equipment_catalog_model_name",
            "service_type",
            "status",
            "received_date",
            "estimated_delivery_date",
            "finished_date",
            "delivered_date",
            "technician",
            "technician_name",
            "customer_complaint",
            "diagnostic_summary",
            "technical_notes",
            "internal_notes",
            "labor_cost",
            "diagnostic_fee",
            "discount_percentage",
            "tax_percentage",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "created_by",
            "parts",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "service_order_number",
            "status",
            "finished_date",
            "delivered_date",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "created_by",
            "created_at",
            "updated_at",
        )


class ServiceOrderSummarySerializer(serializers.ModelSerializer):
    """Resumen para los historiales de servicio de cliente y equipo."""

    class Meta:
        model = ServiceOrder
        fields = (
            "id",
            "service_order_number",
            "status",
            "service_type",
            "received_date",
            "finished_date",
            "delivered_date",
            "total_amount",
        )
