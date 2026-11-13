"""Costos devengados de campo y liquidaciones inmutables."""
from decimal import Decimal, ROUND_HALF_UP
from datetime import time

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.core import roles
from apps.core.permissions import role_required
from .models import (FieldJob, FieldPilot, PilotRate, PilotEarning, FieldAssistant, AssistantDay, FieldExpense, FieldPayment)


def money(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def accrue_pilot(job):
    """Caller holds the job lock; never changes a saved rate or earning."""
    if job.status not in ("done", "invoiced") or not job.actual_hectares or not job.pilot_id or not job.done_date:
        return
    rate = PilotRate.objects.filter(pilot_id=job.pilot_id).first()
    if rate:
        PilotEarning.objects.get_or_create(job=job, defaults={
            "pilot_id": job.pilot_id, "earned_date": job.done_date,
            "hectares": job.actual_hectares, "rate_per_hectare": rate.rate_per_hectare,
            "amount": money(job.actual_hectares * rate.rate_per_hectare),
        })


class RateSerializer(serializers.ModelSerializer):
    pilot_name = serializers.CharField(source="pilot.name", read_only=True)

    class Meta:
        model = PilotRate
        fields = ("id", "pilot", "pilot_name", "rate_per_hectare")

    def validate_pilot(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Selecciona un piloto activo.")
        if self.instance and value.pk != self.instance.pilot_id:
            raise serializers.ValidationError("No se cambia el piloto de una tarifa existente.")
        return value


class FieldPilotSerializer(serializers.ModelSerializer):
    rate_per_hectare = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"), write_only=True, required=False)

    class Meta:
        model = FieldPilot
        fields = ("id", "name", "phone", "is_active", "rate_per_hectare")

    @transaction.atomic
    def create(self, validated_data):
        rate = validated_data.pop("rate_per_hectare", None)
        pilot = super().create(validated_data)
        if rate is not None:
            PilotRate.objects.create(pilot=pilot, rate_per_hectare=rate)
        return pilot

    @transaction.atomic
    def update(self, instance, validated_data):
        rate = validated_data.pop("rate_per_hectare", None)
        instance = super().update(instance, validated_data)
        if rate is not None:
            PilotRate.objects.update_or_create(pilot=instance, defaults={"rate_per_hectare": rate})
            for job in FieldJob.objects.select_for_update(of=("self",)).filter(pilot=instance, status__in=("done", "invoiced"), pilot_earning__isnull=True).order_by("pk"):
                accrue_pilot(job)
        return instance


class AssistantSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldAssistant
        fields = ("id", "name", "is_active")


class EarningSerializer(serializers.ModelSerializer):
    job_number = serializers.CharField(source="job.number", read_only=True)
    customer_name = serializers.CharField(source="job.customer.name", read_only=True)
    pilot_name = serializers.CharField(source="pilot.name", read_only=True)
    actuals_from_legacy = serializers.BooleanField(source="job.actuals_from_legacy", read_only=True)

    class Meta:
        model = PilotEarning
        fields = ("id", "job", "job_number", "customer_name", "pilot", "pilot_name", "earned_date", "hectares", "rate_per_hectare", "amount", "payment", "actuals_from_legacy")
        read_only_fields = fields


class DaySerializer(serializers.ModelSerializer):
    assistant_name = serializers.CharField(source="assistant.name", read_only=True)

    class Meta:
        model = AssistantDay
        fields = ("id", "assistant", "assistant_name", "date", "end_time", "base_rate", "overtime_rate", "overtime_minutes", "amount", "notes", "payment")
        read_only_fields = ("base_rate", "overtime_rate", "overtime_minutes", "amount", "payment")

    def validate(self, attrs):
        day = attrs.get("date", getattr(self.instance, "date", timezone.localdate()))
        if day > timezone.localdate():
            raise serializers.ValidationError({"date": "No registres jornadas futuras."})
        end = attrs.get("end_time", getattr(self.instance, "end_time", time(16)))
        if end < time(16):
            raise serializers.ValidationError({"end_time": "La jornada base termina a las 16:00; registra una salida desde esa hora."})
        assistant = attrs.get("assistant", getattr(self.instance, "assistant", None))
        if assistant and not assistant.is_active:
            raise serializers.ValidationError({"assistant": "El asistente está inactivo."})
        minutes = end.hour * 60 + end.minute - 16 * 60
        attrs["overtime_minutes"] = minutes
        base = self.instance.base_rate if self.instance else Decimal("20")
        rate = self.instance.overtime_rate if self.instance else Decimal("3")
        attrs["amount"] = money(base + Decimal(minutes) / 60 * rate)
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")

    class Meta:
        model = FieldExpense
        fields = ("id", "date", "category", "description", "payee", "amount", "equipment", "equipment_name", "receipt_reference", "payment_date", "payment_method", "payment_reference")
        read_only_fields = ("payment_date", "payment_method", "payment_reference")

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("No registres gastos futuros.")
        return value


class PaymentInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["pilot", "assistant"])
    items = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=500)
    expected_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"))
    payment_date = serializers.DateField(default=timezone.localdate)
    method = serializers.ChoiceField(choices=FieldPayment.Method.choices)
    reference = serializers.CharField(max_length=150, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ExpensePaymentInput(serializers.Serializer):
    payment_date = serializers.DateField(default=timezone.localdate)
    method = serializers.ChoiceField(choices=FieldPayment.Method.choices)
    reference = serializers.CharField(max_length=150, required=False, allow_blank=True)


class FieldPaymentSerializer(serializers.ModelSerializer):
    pilot_earnings = EarningSerializer(many=True, read_only=True)
    assistant_days = DaySerializer(many=True, read_only=True)

    class Meta:
        model = FieldPayment
        fields = ("id", "kind", "beneficiary", "payment_date", "method", "reference", "notes", "amount", "pilot_earnings", "assistant_days")
        read_only_fields = fields


def validate_payment_date(value, dates):
    if value > timezone.localdate() or any(value < day for day in dates):
        raise ValidationError({"payment_date": "La fecha debe estar entre la fecha del gasto o trabajo y hoy."})


@transaction.atomic
def settle(*, data, user):
    kind = data["kind"]
    ids = data["items"]
    if len(set(ids)) != len(ids):
        raise ValidationError({"items": "Hay registros repetidos."})
    model = PilotEarning if kind == "pilot" else AssistantDay
    rows = list(model.objects.select_for_update().filter(pk__in=ids).order_by("pk"))
    if len(rows) != len(ids) or any(row.payment_id for row in rows):
        raise ValidationError({"items": "Algún registro no existe o ya está pagado. Actualiza la lista."})
    people = {row.pilot_id if kind == "pilot" else row.assistant_id for row in rows}
    if len(people) != 1:
        raise ValidationError({"items": "Cada liquidación corresponde a una sola persona."})
    amount = sum((r.amount for r in rows), Decimal("0"))
    if amount != data["expected_amount"]:
        raise ValidationError({"expected_amount": "El total cambió. Actualiza la lista y revisa el pago."})
    validate_payment_date(data["payment_date"], [row.earned_date if kind == "pilot" else row.date for row in rows])
    person = rows[0].pilot.name if kind == "pilot" else rows[0].assistant.name
    payment = FieldPayment.objects.create(
        kind=kind, beneficiary=person, amount=amount,
        payment_date=data["payment_date"], method=data["method"], reference=data.get("reference", ""),
        notes=data.get("notes", ""), created_by=user,
    )
    model.objects.filter(pk__in=ids).update(payment=payment)
    return payment


class FinanceViewSet(viewsets.GenericViewSet):
    pagination_class = None

    def get_permissions(self):
        allowed = roles.FINANCIAL_READ if self.request.method in ("GET", "HEAD", "OPTIONS") else roles.PAYMENTS_WRITE
        return [role_required(*allowed)()]


class FieldPilotViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, FinanceViewSet):
    queryset = FieldPilot.objects.all()
    serializer_class = FieldPilotSerializer

    def get_permissions(self):
        from rest_framework.permissions import IsAuthenticated
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return super().get_permissions()


class RateViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, FinanceViewSet):
    queryset = PilotRate.objects.select_related("pilot").order_by("pilot__name")
    serializer_class = RateSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        self.save_rate(serializer)

    @transaction.atomic
    def perform_update(self, serializer):
        self.save_rate(serializer)

    def save_rate(self, serializer):
        rate = serializer.save()
        jobs = FieldJob.objects.select_for_update(of=("self",)).filter(pilot_id=rate.pilot_id, status__in=("done", "invoiced"), pilot_earning__isnull=True).order_by("pk")
        for job in jobs:
            accrue_pilot(job)


class AssistantViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, FinanceViewSet):
    queryset = FieldAssistant.objects.all().order_by("name")
    serializer_class = AssistantSerializer


class AssignPilotInput(serializers.Serializer):
    job = serializers.IntegerField(min_value=1)
    pilot = serializers.IntegerField(min_value=1)


class EarningViewSet(mixins.ListModelMixin, FinanceViewSet):
    serializer_class = EarningSerializer

    def get_queryset(self):
        qs = PilotEarning.objects.select_related("job__customer", "pilot").order_by("earned_date", "pk")
        return filter_pending(qs, self.request, "pilot")

    @extend_schema(request=AssignPilotInput, responses=EarningSerializer)
    @action(detail=False, methods=["post"])
    @transaction.atomic
    def assign(self, request):
        serializer = AssignPilotInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        job = FieldJob.objects.select_for_update().filter(pk=data["job"]).first()
        if not job or job.status not in ("done", "invoiced") or not job.actual_hectares or not job.done_date:
            raise ValidationError("El trabajo necesita cierre con fecha y hectáreas reales.")
        if PilotEarning.objects.filter(job=job).exists():
            raise ValidationError("Este trabajo ya tiene un costo de piloto registrado.")
        rate = PilotRate.objects.filter(pilot_id=data["pilot"], pilot__is_active=True).first()
        if not rate:
            raise ValidationError("Configura primero la tarifa de un piloto activo.")
        job.pilot_id = rate.pilot_id
        job.save(update_fields=["pilot", "updated_at"])
        accrue_pilot(job)
        return Response(self.get_serializer(PilotEarning.objects.get(job=job)).data)


def filter_pending(qs, request, person):
    value = request.query_params.get(person)
    if value:
        try:
            qs = qs.filter(**{person+"_id": int(value)})
        except (ValueError, TypeError):
            raise ValidationError({person: "Selecciona una persona válida."})
    if request.query_params.get("paid", "false") != "all":
        qs = qs.filter(payment__isnull=request.query_params.get("paid", "false") != "true")
    return qs


class DayViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, FinanceViewSet):
    serializer_class = DaySerializer

    def get_queryset(self):
        return filter_pending(AssistantDay.objects.select_related("assistant").all(), self.request, "assistant")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.instance = AssistantDay.objects.select_for_update().get(pk=serializer.instance.pk)
        if serializer.instance.payment_id:
            raise ValidationError("Una jornada pagada no se modifica.")
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance = AssistantDay.objects.select_for_update().get(pk=instance.pk)
        if instance.payment_id:
            raise ValidationError("Una jornada pagada no se elimina.")
        instance.delete()


class ExpenseViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, FinanceViewSet):
    queryset = FieldExpense.objects.select_related("equipment").all()
    serializer_class = ExpenseSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.instance = FieldExpense.objects.select_for_update().get(pk=serializer.instance.pk)
        if serializer.instance.payment_date:
            raise ValidationError("Un gasto pagado no se modifica.")
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance = FieldExpense.objects.select_for_update().get(pk=instance.pk)
        if instance.payment_date:
            raise ValidationError("Un gasto pagado no se elimina.")
        instance.delete()

    @extend_schema(request=ExpensePaymentInput, responses=ExpenseSerializer)
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def pay(self, request, pk=None):
        expense = FieldExpense.objects.select_for_update().get(pk=self.get_object().pk)
        if expense.payment_date:
            raise ValidationError("Este gasto ya está pagado.")
        serializer = ExpensePaymentInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        validate_payment_date(data["payment_date"], [expense.date])
        expense.payment_date, expense.payment_method = data["payment_date"], data["method"]
        expense.payment_reference = data.get("reference", "")
        expense.paid_by = request.user
        expense.save(update_fields=["payment_date", "payment_method", "payment_reference", "paid_by", "updated_at"])
        return Response(self.get_serializer(expense).data)


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, FinanceViewSet):
    queryset = FieldPayment.objects.prefetch_related("pilot_earnings__job__customer", "pilot_earnings__pilot", "assistant_days__assistant")
    serializer_class = FieldPaymentSerializer

    @extend_schema(request=PaymentInput, responses=FieldPaymentSerializer)
    def create(self, request):
        serializer = PaymentInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = settle(data=serializer.validated_data, user=request.user)
        return Response(self.get_serializer(payment).data, status=201)
