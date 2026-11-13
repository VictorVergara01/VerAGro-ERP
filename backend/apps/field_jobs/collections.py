"""One receivable per completed operation; invoices mirror its receipts."""
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Value, DecimalField, F, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes
from apps.core import roles
from apps.core.permissions import role_required
from .models import FieldJob, FieldCollection

COMPLETED = (FieldJob.Status.DONE, FieldJob.Status.INVOICED)
MONEY = DecimalField(max_digits=18, decimal_places=2)


def accounts_queryset():
    return FieldJob.objects.filter(status__in=COMPLETED).select_related('customer', 'pilot').annotate(
        collected=Coalesce(Sum('collections__amount'), Value(Decimal('0')), output_field=MONEY),
    ).annotate(balance=F('total') - F('collected'))


def account_row(job):
    today = timezone.localdate()
    balance = max(job.balance, Decimal('0'))
    status = 'paid' if balance == 0 else 'overdue' if job.due_date and job.due_date < today else 'partial' if job.collected > 0 else 'pending'
    return {
        'id': job.pk, 'number': job.number, 'customer': job.customer_id, 'customer_name': job.customer.name,
        'pilot': job.pilot_id, 'pilot_name': job.pilot.name if job.pilot_id else 'Sin asignar',
        'job_type': job.job_type, 'done_date': job.done_date, 'due_date': job.due_date,
        'total': job.total, 'collected': job.collected, 'balance_due': balance,
        'collection_status': status,
        'days_overdue': (today - job.due_date).days if status == 'overdue' else 0,
    }


class CollectionInput(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    payment_date = serializers.DateField(default=timezone.localdate)
    method = serializers.ChoiceField(choices=FieldCollection._meta.get_field('method').choices)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    request_id = serializers.UUIDField()
    expected_balance = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0'), required=False)


class CollectionSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source='created_by.full_name', read_only=True, default='')

    class Meta:
        model = FieldCollection
        fields = ('id', 'amount', 'payment_date', 'method', 'reference', 'notes', 'request_id', 'recorded_by')
        read_only_fields = fields


class TermsInput(serializers.Serializer):
    due_date = serializers.DateField(allow_null=True)


@transaction.atomic
def record_collection(*, job, data, user, invoice=None):
    from apps.billing.models import Invoice, Payment
    from apps.billing.services import recalculate_invoice

    job = FieldJob.objects.select_for_update().get(pk=job.pk)
    serializer = CollectionInput(data=data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    existing = FieldCollection.objects.filter(request_id=data['request_id']).first()
    if existing:
        if existing.job_id != job.pk or any(getattr(existing, key) != data.get(key, '') for key in ('amount', 'payment_date', 'method', 'reference', 'notes')):
            raise ValidationError({'request_id': 'Esta referencia de operación ya se usó con otros datos.'})
        return existing
    if job.status not in COMPLETED:
        raise ValidationError({'status': 'Cierra el trabajo con sus cantidades reales antes de registrar cobros.'})
    if not job.done_date or data['payment_date'] < job.done_date or data['payment_date'] > timezone.localdate():
        raise ValidationError({'payment_date': 'La fecha del cobro debe estar entre la realización del trabajo y hoy.'})
    collected = job.collections.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    balance = job.total - collected
    if data['amount'] > balance:
        raise ValidationError({'amount': f'El saldo pendiente es {balance:.2f}; no se puede cobrar de más.'})
    if 'expected_balance' in data and data['expected_balance'] != balance:
        raise ValidationError({'expected_balance': 'El saldo cambió. Actualiza y revisa el cobro.'})
    active = list(Invoice.objects.select_for_update().filter(field_job=job).exclude(status='cancelled').order_by('pk'))
    if len(active) > 1:
        raise ValidationError('El trabajo tiene varias facturas activas. Revisa sus documentos antes de cobrar.')
    document = active[0] if active else None
    if invoice and (not document or invoice.pk != document.pk):
        raise ValidationError('La factura ya no está activa para este trabajo.')
    receipt = FieldCollection.objects.create(
        job=job, amount=data['amount'], payment_date=data['payment_date'], method=data['method'],
        reference=data.get('reference', ''), notes=data.get('notes', ''), request_id=data['request_id'], created_by=user,
    )
    if document:
        payment = Payment.objects.create(invoice=document, amount=receipt.amount, payment_date=receipt.payment_date,
            method=receipt.method, reference_number=receipt.reference, notes=receipt.notes, created_by=user)
        receipt.invoice_payment = payment
        receipt.save(update_fields=['invoice_payment', 'updated_at'])
        recalculate_invoice(document)
    return receipt


def attach_collections(job, invoice):
    """Caller holds job lock and creates a new invoice in the same transaction."""
    from apps.billing.models import Payment
    from apps.billing.services import recalculate_invoice
    for receipt in job.collections.select_for_update().order_by('pk'):
        if receipt.invoice_payment_id:
            raise ValidationError('Ya hay cobros vinculados a otra factura; conserva su documento original.')
        payment = Payment.objects.create(invoice=invoice, amount=receipt.amount, payment_date=receipt.payment_date,
            method=receipt.method, reference_number=receipt.reference, notes=receipt.notes, created_by=receipt.created_by)
        receipt.invoice_payment = payment
        receipt.save(update_fields=['invoice_payment', 'updated_at'])
    recalculate_invoice(invoice)


class FieldAccountViewSet(viewsets.GenericViewSet):
    serializer_class = CollectionSerializer

    def get_permissions(self):
        allowed = roles.FINANCIAL_READ if self.request.method in ('GET', 'HEAD', 'OPTIONS') else roles.PAYMENTS_WRITE
        if self.action == 'terms':
            allowed = (*roles.ADMINS, roles.SALES, roles.ACCOUNTING)
        return [role_required(*allowed)()]

    def get_queryset(self):
        return accounts_queryset()

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def list(self, request):
        from .views import _date_param, _int_param
        jobs = self.get_queryset()
        for name in ('customer', 'pilot'):
            value = _int_param(request.query_params, name)
            if value is not None:
                jobs = jobs.filter(**{name+'_id': value})
        for param, lookup in (('from', 'done_date__gte'), ('to', 'done_date__lte')):
            value = _date_param(request.query_params, param)
            if value:
                jobs = jobs.filter(**{lookup: value})
        rows = [account_row(job) for job in jobs.order_by('-done_date', '-pk')]
        search = request.query_params.get('search', '').strip().casefold()
        if search:
            rows = [r for r in rows if search in f"{r['number']} {r['customer_name']} {r['pilot_name']}".casefold()]
        status = request.query_params.get('collection_status', '')
        if status:
            if status not in ('paid', 'pending', 'partial', 'overdue'):
                raise ValidationError({'collection_status': 'Estado de cobro inválido.'})
            rows = [r for r in rows if r['collection_status'] == status]
        return Response({'items': rows, 'summary': {
            'total': sum((r['total'] for r in rows), Decimal('0')),
            'collected': sum((r['collected'] for r in rows), Decimal('0')),
            'balance_due': sum((r['balance_due'] for r in rows), Decimal('0')),
            'overdue': sum((r['balance_due'] for r in rows if r['collection_status'] == 'overdue'), Decimal('0')),
        }})

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def retrieve(self, request, pk=None):
        from apps.billing.models import Invoice
        job = self.get_object()
        invoice = job.invoices.exclude(status=Invoice.Status.CANCELLED).order_by('-pk').first()
        return Response({**account_row(job), 'collections': CollectionSerializer(job.collections.select_related('created_by'), many=True).data,
            'invoice': {'id': invoice.pk, 'number': invoice.invoice_number, 'status': invoice.status} if invoice else None})

    @extend_schema(request=CollectionInput, responses=CollectionSerializer)
    @action(detail=True, methods=['post'])
    def collect(self, request, pk=None):
        receipt = record_collection(job=self.get_object(), data=request.data, user=request.user)
        return Response(CollectionSerializer(receipt).data, status=201)

    @extend_schema(request=TermsInput, responses=OpenApiTypes.OBJECT)
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def terms(self, request, pk=None):
        job = FieldJob.objects.select_for_update().get(pk=self.get_object().pk)
        serializer = TermsInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        due = serializer.validated_data['due_date']
        if due and job.done_date and due < job.done_date:
            raise ValidationError({'due_date': 'El vencimiento no puede ser anterior al trabajo.'})
        job.due_date = due
        job.save(update_fields=['due_date', 'updated_at'])
        job.invoices.exclude(status='cancelled').update(due_date=due)
        return Response({'due_date': due})
