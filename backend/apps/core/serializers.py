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
            "updated_at",
        )
        read_only_fields = ("updated_at",)
