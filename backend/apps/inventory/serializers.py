from rest_framework import serializers

from .models import InventoryMovement, Product, ProductCategory
from .services import apply_adjustment


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ("id", "name")


class ProductSerializer(serializers.ModelSerializer):
    available_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = Product
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "stock_quantity",
            "reserved_quantity",
        )


class InventoryMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "product",
            "movement_type",
            "quantity",
            "unit_cost",
            "reference_type",
            "reference_id",
            "notes",
            "created_by",
            "created_at",
        )


class AdjustmentSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True)
    )
    movement_type = serializers.ChoiceField(
        choices=["adjustment_in", "adjustment_out"]
    )
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return apply_adjustment(
            product=validated_data["product"],
            movement_type=validated_data["movement_type"],
            quantity=validated_data["quantity"],
            unit_cost=validated_data.get("unit_cost", 0),
            notes=validated_data.get("notes", ""),
            user=user,
        )

    def to_representation(self, instance):
        return InventoryMovementSerializer(instance).data
