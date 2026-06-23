from rest_framework import serializers

from .models import CompanyProfile


class CompanyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyProfile
        fields = (
            "name",
            "legal_name",
            "tax_id",
            "address",
            "phone",
            "email",
            "whatsapp",
            "logo",
            "invoice_footer",
            "fumigation_price_per_hectare",
            "spreading_price_per_quintal",
            "drone_tank_volume_liters",
            "default_water_per_hectare",
            "updated_at",
        )
        read_only_fields = ("updated_at",)
