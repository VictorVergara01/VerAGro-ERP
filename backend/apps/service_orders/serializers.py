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

    class Meta:
        model = ServiceOrderPart
        fields = (
            "id",
            "service_order",
            "product",
            "product_sku",
            "product_name",
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
        return attrs


class ServiceOrderSerializer(serializers.ModelSerializer):
    parts = ServiceOrderPartSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
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
