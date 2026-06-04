from rest_framework import serializers

from .models import Equipment, EquipmentType


class EquipmentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentType
        # Omite intencionalmente is_active: el endpoint solo expone tipos activos.
        fields = ("id", "name")


class EquipmentSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source="customer.name", read_only=True, default=None
    )
    equipment_type_name = serializers.CharField(
        source="equipment_type.name", read_only=True, default=None
    )

    class Meta:
        model = Equipment
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        # En PATCH parcial attrs solo trae lo enviado; respaldo con la instancia.
        instance = self.instance
        owner_type = attrs.get(
            "owner_type",
            getattr(instance, "owner_type", None)
            if instance
            else Equipment.OwnerType.CUSTOMER,
        )
        if "customer" in attrs:
            customer = attrs.get("customer")
        else:
            customer = getattr(instance, "customer", None) if instance else None

        if owner_type == "customer" and customer is None:
            raise serializers.ValidationError(
                "Un equipo de tipo propietario 'customer' requiere un cliente."
            )
        if owner_type == "company" and customer is not None:
            raise serializers.ValidationError(
                "Un equipo de la empresa ('company') no debe tener cliente."
            )
        return attrs
