from django.db import transaction
from rest_framework import serializers

from .models import (
    ChecklistTemplate,
    ChecklistTemplateItem,
    ServiceChecklist,
    ServiceChecklistItem,
)


class ChecklistTemplateItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistTemplateItem
        fields = (
            "id",
            "template",
            "name",
            "description",
            "order",
            "is_required",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"template": {"required": False}}


class ChecklistTemplateSerializer(serializers.ModelSerializer):
    items = ChecklistTemplateItemSerializer(many=True, required=False)

    class Meta:
        model = ChecklistTemplate
        fields = (
            "id",
            "name",
            "equipment_type",
            "description",
            "is_active",
            "items",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        template = ChecklistTemplate.objects.create(**validated_data)
        for item in items_data:
            item.pop("template", None)
            ChecklistTemplateItem.objects.create(template=template, **item)
        return template


class ServiceChecklistItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="template_item.name", read_only=True)
    item_order = serializers.IntegerField(source="template_item.order", read_only=True)
    is_required = serializers.BooleanField(
        source="template_item.is_required", read_only=True
    )
    recommended_product_sku = serializers.CharField(
        source="recommended_product.sku", read_only=True
    )

    class Meta:
        model = ServiceChecklistItem
        fields = (
            "id",
            "service_checklist",
            "template_item",
            "item_name",
            "item_order",
            "is_required",
            "status",
            "notes",
            "recommended_product",
            "recommended_product_sku",
            "priority",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "service_checklist",
            "template_item",
            "created_at",
            "updated_at",
        )


class ServiceChecklistSerializer(serializers.ModelSerializer):
    items = ServiceChecklistItemSerializer(many=True, read_only=True)
    template_name = serializers.CharField(
        source="checklist_template.name", read_only=True
    )

    class Meta:
        model = ServiceChecklist
        fields = (
            "id",
            "service_order",
            "checklist_template",
            "template_name",
            "completed_by",
            "completed_at",
            "items",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "service_order",
            "checklist_template",
            "completed_by",
            "completed_at",
            "created_at",
            "updated_at",
        )
