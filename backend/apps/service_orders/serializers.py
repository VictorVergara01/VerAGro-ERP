from rest_framework import serializers

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


class ServiceOrderPartSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
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
            "component",
            "component_name",
            "component_code",
            "component_path",
            "quantity",
            "unit_cost",
            "unit_price",
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
        )
        extra_kwargs = {"service_order": {"required": False}}

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Debe ser mayor que cero.")
        return value

    def validate(self, attrs):
        # Defaults de costo/precio desde el producto si no se envían.
        product = attrs.get("product")
        if product is not None:
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
