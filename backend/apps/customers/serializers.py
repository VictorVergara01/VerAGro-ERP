from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        id_type = attrs.get("identification_type")
        id_number = attrs.get("identification_number")
        if id_type and not id_number:
            raise serializers.ValidationError(
                "Debe indicar el número de identificación si especifica el tipo."
            )
        return attrs
