from decimal import Decimal
from rest_framework import serializers

from .models import FieldJob, FieldJobProduct, FieldPlot, FieldPlotProduct, FieldPilot


class FieldJobProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldJobProduct
        fields = ("id", "name", "dose_per_hectare", "unit")


class FieldJobSerializer(serializers.ModelSerializer):
    estimated_quintals = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    estimated_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    actual_quintals_per_hectare = serializers.DecimalField(max_digits=16, decimal_places=4, read_only=True, allow_null=True)
    total_quintals = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    billable_quantity = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    products = FieldJobProductSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    plot = serializers.PrimaryKeyRelatedField(
        queryset=FieldPlot.objects.all(),
        required=False,
        allow_null=True,
    )
    plot_name = serializers.CharField(source="plot.name", read_only=True, default="")
    equipment_name = serializers.CharField(
        source="equipment.name", read_only=True, default=""
    )
    pilot_name = serializers.CharField(
        source="pilot.name", read_only=True, default=""
    )
    pilot = serializers.PrimaryKeyRelatedField(queryset=FieldPilot.objects.all(), required=False, allow_null=True)

    def validate_pilot(self, value):
        if value and not value.is_active and (not self.instance or self.instance.pilot_id != value.pk):
            raise serializers.ValidationError("Selecciona un piloto activo.")
        return value
    job_type_display = serializers.CharField(
        source="get_job_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    crop_display = serializers.CharField(source="get_crop_display", read_only=True)
    invoice_number = serializers.SerializerMethodField()

    def get_invoice_number(self, obj):
        invoice = next(
            (inv for inv in obj.invoices.all() if inv.status != "cancelled"),
            None,
        )
        return invoice.invoice_number if invoice else None

    def validate_products(self, value):
        if len(value) > 10:
            raise serializers.ValidationError("Máximo 10 químicos por trabajo.")
        return value

    def validate(self, attrs):
        kind = attrs.get("job_type", getattr(self.instance, "job_type", "fumigation"))
        billing_unit = attrs.get("billing_unit", getattr(self.instance, "billing_unit", "ha"))
        if kind == "spreading" and self.instance is None and "unit_price" not in attrs:
            from apps.core.models import CompanyProfile
            company = CompanyProfile.load()
            attrs["unit_price"] = company.spreading_price_per_quintal if billing_unit == "qq" else company.spreading_price_per_hectare
        dose = attrs.get("quintals_per_hectare", getattr(self.instance, "quintals_per_hectare", None))
        planned_qq = attrs.get("planned_quintals", getattr(self.instance, "planned_quintals", None))
        if planned_qq is not None and planned_qq <= 0:
            raise serializers.ValidationError({"planned_quintals": "La cantidad debe ser mayor que cero."})
        if dose is not None and dose <= 0:
            raise serializers.ValidationError({"quintals_per_hectare": "La carga debe ser mayor que cero."})
        if kind != "spreading":
            if billing_unit != "ha":
                raise serializers.ValidationError({"billing_unit": "La pulverización se cobra por hectárea."})
            attrs["quintals_per_hectare"] = None
            attrs["planned_quintals"] = None
        elif billing_unit == "qq" and dose is None and planned_qq is None:
            raise serializers.ValidationError({"quintals_per_hectare": "Indica los qq aplicados por hectárea para calcular el cobro."})
        products = attrs.get("products")
        if products is None and self.instance:
            products = [{"unit": p.unit} for p in self.instance.products.all()]
        if kind == "spreading":
            if any(p["unit"] not in ("kg/ha", "g/ha", "qq/ha") for p in (products or [])):
                raise serializers.ValidationError({"products": "Para sólidos usa kg/ha, g/ha o qq/ha; revisa las dosis antes de cambiar el tipo."})
            attrs["water_per_hectare"] = None
            attrs["tank_volume_liters"] = None
        for field in ("hectares", "unit_price"):
            if field in attrs and (attrs[field] < 0 or (field == "hectares" and attrs[field] == 0)):
                raise serializers.ValidationError({field: "El área debe ser mayor que cero y el precio no puede ser negativo."})
        # El lote es un enlace informativo: debe ser del mismo cliente del trabajo.
        # En PATCH parcial, cliente y lote se resuelven contra la instancia.
        plot = attrs.get("plot", getattr(self.instance, "plot", None))
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        if plot is not None and customer is not None and plot.customer_id != customer.id:
            raise serializers.ValidationError(
                {"plot": "El lote no pertenece al cliente del trabajo."}
            )
        # Desactivar un lote no debe congelar los trabajos que ya lo referencian:
        # solo se rechaza un lote inactivo cuando el pedido intenta enlazarlo de nuevo
        # (crear, o cambiar el lote de un trabajo existente), no cuando el trabajo
        # simplemente re-envía el lote que ya tenía.
        previous_plot = getattr(self.instance, "plot", None) if self.instance else None
        if plot is not None and plot != previous_plot and not plot.is_active:
            raise serializers.ValidationError(
                {"plot": "No se puede enlazar un lote desactivado."}
            )
        return attrs

    class Meta:
        model = FieldJob
        fields = (
            "id",
            "number",
            "job_type",
            "job_type_display",
            "status",
            "status_display",
            "customer",
            "customer_name",
            "plot",
            "plot_name",
            "equipment",
            "equipment_name",
            "pilot",
            "pilot_name",
            "scheduled_date",
            "done_date",
            "due_date",
            "location",
            "crop",
            "crop_display",
            "crop_other",
            "products",
            "hectares",
            "billing_unit",
            "quintals_per_hectare",
            "planned_quintals",
            "actual_hectares",
            "actuals_from_legacy",
            "applied_quintals",
            "estimated_quintals",
            "estimated_total",
            "actual_quintals_per_hectare",
            "total_quintals",
            "billable_quantity",
            "unit_price",
            "total",
            "tank_volume_liters",
            "water_per_hectare",
            "notes",
            "invoice_number",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "actuals_from_legacy",
            "actual_hectares",
            "applied_quintals",
            "id",
            "number",
            "status",
            "done_date",
            "total",
            "created_by",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):
        products = validated_data.pop("products", [])
        job = super().create(validated_data)
        for product in products:
            FieldJobProduct.objects.create(field_job=job, **product)
        return job

    def update(self, instance, validated_data):
        products = validated_data.pop("products", None)
        job = super().update(instance, validated_data)
        if products is not None:
            job.products.all().delete()
            for product in products:
                FieldJobProduct.objects.create(field_job=job, **product)
        return job


class FieldJobCompletionSerializer(serializers.Serializer):
    actual_hectares = serializers.DecimalField(max_digits=10, decimal_places=4, min_value=Decimal("0.0001"))
    applied_quintals = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True)
    done_date = serializers.DateField(required=False)
    due_date = serializers.DateField(required=False)

    def validate(self, attrs):
        job = self.context["job"]
        if job.job_type != "spreading" and attrs.get("applied_quintals") is not None:
            raise serializers.ValidationError({"applied_quintals": "Los quintales aplican a trabajos con sólidos."})
        if job.billing_unit == "qq" and attrs.get("applied_quintals") is None:
            raise serializers.ValidationError({"applied_quintals": "Indica los qq realmente aplicados para calcular el cobro."})
        return attrs


class FieldPlotProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldPlotProduct
        fields = ("id", "name", "dose_per_hectare", "unit")


class FieldPlotSerializer(serializers.ModelSerializer):
    products = FieldPlotProductSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    crop_display = serializers.CharField(source="get_crop_display", read_only=True)

    class Meta:
        model = FieldPlot
        fields = (
            "id",
            "customer",
            "customer_name",
            "name",
            "hectares",
            "crop",
            "crop_display",
            "crop_other",
            "location",
            "water_per_hectare",
            "notes",
            "products",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_active", "created_at", "updated_at")
        # Sin esto, DRF auto-genera un UniqueTogetherValidator (customer, name) a partir
        # del UniqueConstraint condicional del modelo: hace match exacto por case-sensitivity
        # y dispara antes que validate() de abajo, tapando su mensaje con uno genérico bajo
        # non_field_errors. validate() ya cubre esta regla mejor (case-insensitive, solo
        # activos, excluye la instancia en edición), así que es la única fuente de verdad.
        validators = []

    def validate_products(self, value):
        if len(value) > 10:
            raise serializers.ValidationError("Máximo 10 químicos por lote.")
        return value

    def validate(self, attrs):
        # En PATCH parcial attrs solo trae lo enviado; se completa con la instancia
        # para poder chequear el par (cliente, nombre) contra los lotes activos.
        customer = attrs.get(
            "customer", getattr(self.instance, "customer", None) if self.instance else None
        )
        name = attrs.get(
            "name", getattr(self.instance, "name", "") if self.instance else ""
        )
        qs = FieldPlot.objects.filter(
            customer=customer, name__iexact=name, is_active=True
        )
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"name": "Ya existe un lote activo con ese nombre para este cliente."}
            )
        return attrs

    def create(self, validated_data):
        products = validated_data.pop("products", [])
        plot = super().create(validated_data)
        for product in products:
            FieldPlotProduct.objects.create(plot=plot, **product)
        return plot

    def update(self, instance, validated_data):
        products = validated_data.pop("products", None)
        plot = super().update(instance, validated_data)
        if products is not None:
            plot.products.all().delete()
            for product in products:
                FieldPlotProduct.objects.create(plot=plot, **product)
        return plot
