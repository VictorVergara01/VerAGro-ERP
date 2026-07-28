from collections import defaultdict

from rest_framework import serializers

from .models import EquipmentModel, EquipmentComponent


class EquipmentModelSerializer(serializers.ModelSerializer):
    equipment_type_name = serializers.CharField(
        source="equipment_type.name", read_only=True
    )

    class Meta:
        model = EquipmentModel
        fields = (
            "id",
            "equipment_type",
            "equipment_type_name",
            "brand",
            "name",
            "model_code",
            "revision",
            "description",
            "diagram_type",
            "diagram_file",
            "is_active",
        )
        read_only_fields = ("id",)


class EquipmentComponentSerializer(serializers.ModelSerializer):
    path = serializers.CharField(read_only=True)

    class Meta:
        model = EquipmentComponent
        fields = (
            "id",
            "equipment_model",
            "parent",
            "code",
            "name",
            "component_type",
            "diagram_key",
            "position",
            "description",
            "sort_order",
            "is_active",
            "path",
        )
        read_only_fields = ("id", "path")

    def validate(self, attrs):
        instance = self.instance
        model = attrs.get(
            "equipment_model",
            getattr(instance, "equipment_model", None) if instance else None,
        )
        parent = attrs.get(
            "parent", getattr(instance, "parent", None) if instance else None
        )
        if parent is not None and model is not None:
            if parent.equipment_model_id != model.id:
                raise serializers.ValidationError(
                    {"parent": "El padre debe pertenecer al mismo modelo técnico."}
                )
            # Evitar ciclos al reasignar padre en una edición.
            if instance is not None:
                ancestor, seen = parent, set()
                while ancestor is not None and ancestor.pk not in seen:
                    if ancestor.pk == instance.pk:
                        raise serializers.ValidationError(
                            {"parent": "Relación cíclica no permitida."}
                        )
                    seen.add(ancestor.pk)
                    ancestor = ancestor.parent
        return attrs


def serialize_component_tree(components):
    """Arma el árbol anidado desde un iterable plano de EquipmentComponent.

    Una sola consulta (el caller pasa la lista ya materializada), sin N+1.
    Respeta el orden del queryset (sort_order, name).
    """
    by_parent = defaultdict(list)
    for c in components:
        by_parent[c.parent_id].append(c)

    def node(c):
        return {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "component_type": c.component_type,
            "diagram_key": c.diagram_key,
            "position": c.position,
            "sort_order": c.sort_order,
            "children": [node(ch) for ch in by_parent[c.id]],
        }

    return [node(c) for c in by_parent[None]]
