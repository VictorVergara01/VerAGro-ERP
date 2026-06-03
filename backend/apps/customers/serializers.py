from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "is_active")

    def validate(self, attrs):
        # En PATCH parcial, attrs solo trae los campos enviados; usamos el valor
        # existente de la instancia como respaldo para validar el par tipo/número.
        instance = self.instance
        id_type = attrs.get(
            "identification_type",
            getattr(instance, "identification_type", None) if instance else None,
        )
        id_number = attrs.get(
            "identification_number",
            getattr(instance, "identification_number", None) if instance else None,
        )
        if id_type and not id_number:
            raise serializers.ValidationError(
                "Debe indicar el número de identificación si especifica el tipo."
            )
        return attrs
