from rest_framework import serializers

from .models import Supplier, SupplierProduct


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class SupplierProductSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = SupplierProduct
        fields = (
            "id",
            "supplier",
            "product",
            "supplier_sku",
            "last_cost",
            "currency",
            "minimum_order_quantity",
            "estimated_delivery_days",
            "is_preferred",
            "notes",
            "product_sku",
            "supplier_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
