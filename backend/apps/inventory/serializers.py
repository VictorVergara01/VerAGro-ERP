import uuid

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import InventoryMovement, Product, ProductCategory, ProductCompatibility
from .services import apply_adjustment, generate_product_sku
from .validators import margin_errors_for


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "default_margin_percentage",
            "min_margin_percentage",
            "max_margin_percentage",
        )
        read_only_fields = ("id",)

    def validate(self, attrs):
        errors = margin_errors_for(attrs, self.instance)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def update(self, instance, validated_data):
        watched = (
            "default_margin_percentage",
            "min_margin_percentage",
            "max_margin_percentage",
        )
        before = {field: getattr(instance, field) for field in watched}
        category = super().update(instance, validated_data)
        if any(getattr(category, field) != before[field] for field in watched):
            from .services import apply_category_margin

            apply_category_margin(category)
        return category


class ProductSerializer(serializers.ModelSerializer):
    available_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    # Opcional: si llega vacío se autogenera en create(). El UniqueValidator
    # preserva el rechazo (400) de SKUs manuales duplicados que daba __all__.
    sku = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        validators=[UniqueValidator(queryset=Product.objects.all())],
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
            "min_sale_price",
            "max_sale_price",
        )

    def validate(self, attrs):
        errors = margin_errors_for(attrs, self.instance)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        provided_sku = (validated_data.get("sku") or "").strip()
        if not provided_sku:
            # Valor temporal único para no violar unique en la inserción;
            # se reemplaza por el correlativo una vez conocido el pk.
            validated_data["sku"] = f"TMP-{uuid.uuid4().hex[:12]}"
        product = super().create(validated_data)
        if not provided_sku:
            product.sku = generate_product_sku(product.pk)
            product.save(update_fields=["sku"])
        from .services import apply_margin

        apply_margin(product)
        return product

    def update(self, instance, validated_data):
        watched = (
            "default_margin_percentage",
            "min_margin_percentage",
            "max_margin_percentage",
        )
        before = {field: getattr(instance, field) for field in watched}
        before_category = instance.category_id
        product = super().update(instance, validated_data)
        # El rango depende de los tres márgenes efectivos, que cambian con los del
        # producto o con los de su categoría. Recalcular si cambió cualquiera.
        changed = any(getattr(product, field) != before[field] for field in watched)
        if changed or product.category_id != before_category:
            from .services import apply_margin

            apply_margin(product)
        return product


class InventoryMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "product",
            "movement_type",
            "quantity",
            "unit_cost",
            "average_cost_after",
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
        max_digits=14, decimal_places=4, required=False, default=0
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs.get("movement_type") == "adjustment_in" and not attrs.get("unit_cost"):
            raise serializers.ValidationError(
                {"unit_cost": "La entrada por ajuste requiere el costo unitario."}
            )
        return attrs

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


class ProductCompatibilitySerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True)
    component_code = serializers.CharField(source="component.code", read_only=True)
    component_path = serializers.CharField(source="component.path", read_only=True)
    equipment_model_name = serializers.CharField(
        source="equipment_model.name", read_only=True
    )

    class Meta:
        model = ProductCompatibility
        fields = (
            "id",
            "product",
            "equipment_model",
            "equipment_model_name",
            "component",
            "component_name",
            "component_code",
            "component_path",
            "is_primary",
            "notes",
        )
        read_only_fields = ("id",)

    def validate(self, attrs):
        instance = self.instance
        model = attrs.get(
            "equipment_model",
            getattr(instance, "equipment_model", None) if instance else None,
        )
        component = attrs.get(
            "component",
            getattr(instance, "component", None) if instance else None,
        )
        if (
            model is not None
            and component is not None
            and component.equipment_model_id != model.id
        ):
            raise serializers.ValidationError(
                {"component": "El componente no pertenece al modelo indicado."}
            )
        return attrs
