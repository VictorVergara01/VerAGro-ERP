import uuid

from django.db import transaction
from rest_framework import serializers

from apps.inventory.models import Product, ProductCategory

from .models import PurchaseAdditionalCost, PurchaseOrder, PurchaseOrderLine
from .services import recalculate_costs


class NewProductSerializer(serializers.Serializer):
    """Datos mínimos para dar de alta un producto desde una línea de OC."""

    name = serializers.CharField()
    category = serializers.PrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), required=False, allow_null=True
    )
    sku = serializers.CharField(required=False, allow_blank=True)
    unit_of_measure = serializers.CharField(required=False, allow_blank=True)


def create_product_from_payload(data):
    """Crea un Product mínimo desde {name, category?, sku?, unit_of_measure?}."""
    sku = (data.get("sku") or "").strip()
    product = Product.objects.create(
        name=data["name"],
        category=data.get("category"),
        sku=sku or f"TMP-{uuid.uuid4().hex[:12]}",
        unit_of_measure=data.get("unit_of_measure", "") or "",
    )
    if not sku:
        product.sku = f"SKU-{product.pk:06d}"
        product.save(update_fields=["sku"])
    return product


class PurchaseAdditionalCostSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseAdditionalCost
        fields = (
            "id",
            "purchase_order",
            "name",
            "amount",
            "allocation_method",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        # En creación anidada el purchase_order se inyecta desde la orden padre.
        extra_kwargs = {"purchase_order": {"required": False}}


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    new_product = NewProductSerializer(write_only=True, required=False)

    class Meta:
        model = PurchaseOrderLine
        fields = (
            "id",
            "purchase_order",
            "product",
            "product_sku",
            "product_name",
            "new_product",
            "quantity_ordered",
            "quantity_received",
            "unit_purchase_cost",
            "line_subtotal",
            "allocated_extra_cost",
            "landed_unit_cost",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "quantity_received",
            "line_subtotal",
            "allocated_extra_cost",
            "landed_unit_cost",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "purchase_order": {"required": False},
            "product": {"required": False, "allow_null": True},
        }

    def validate_quantity_ordered(self, value):
        if value <= 0:
            raise serializers.ValidationError("Debe ser mayor que cero.")
        return value

    def validate_unit_purchase_cost(self, value):
        if value < 0:
            raise serializers.ValidationError("No puede ser negativo.")
        return value

    def validate(self, attrs):
        # En edición (PATCH) puede no venir ni product ni new_product: se conserva el existente.
        if self.instance is None and attrs.get("product") is None and not attrs.get("new_product"):
            raise serializers.ValidationError(
                "Cada línea requiere un producto existente o uno nuevo (new_product)."
            )
        return attrs

    def create(self, validated_data):
        new_product = validated_data.pop("new_product", None)
        if validated_data.get("product") is None and new_product:
            validated_data["product"] = create_product_from_payload(new_product)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_product = validated_data.pop("new_product", None)
        if validated_data.get("product") is None and new_product:
            validated_data["product"] = create_product_from_payload(new_product)
        return super().update(instance, validated_data)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True, required=False)
    additional_costs = PurchaseAdditionalCostSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = (
            "id",
            "supplier",
            "supplier_name",
            "order_number",
            "status",
            "order_date",
            "expected_date",
            "currency",
            "subtotal_products",
            "shipping_cost",
            "additional_costs_total",
            "grand_total",
            "notes",
            "created_by",
            "lines",
            "additional_costs",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "subtotal_products",
            "additional_costs_total",
            "grand_total",
            "created_by",
            "created_at",
            "updated_at",
        )

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        costs_data = validated_data.pop("additional_costs", [])
        order = PurchaseOrder.objects.create(**validated_data)
        for line in lines_data:
            line.pop("purchase_order", None)
            new_product = line.pop("new_product", None)
            if line.get("product") is None and new_product:
                line["product"] = create_product_from_payload(new_product)
            PurchaseOrderLine.objects.create(purchase_order=order, **line)
        for cost in costs_data:
            cost.pop("purchase_order", None)
            PurchaseAdditionalCost.objects.create(purchase_order=order, **cost)
        recalculate_costs(order)
        order.refresh_from_db()
        return order


class PurchaseOrderSummarySerializer(serializers.ModelSerializer):
    """Resumen para el historial de compras de un proveedor."""

    class Meta:
        model = PurchaseOrder
        fields = (
            "id",
            "order_number",
            "status",
            "order_date",
            "expected_date",
            "currency",
            "grand_total",
        )
