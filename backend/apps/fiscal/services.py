from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import Invoice

from .models import FiscalDocument
from .providers import get_provider


def emit_fiscal_document(*, invoice, user=None) -> FiscalDocument:
    if invoice.status in (Invoice.Status.DRAFT, Invoice.Status.CANCELLED):
        raise ValidationError(
            {"status": "Solo se emite FEL de una factura emitida (no borrador ni cancelada)."}
        )
    existing = getattr(invoice, "fiscal", None)
    if existing and existing.fiscal_status != FiscalDocument.FiscalStatus.CANCELLED:
        raise ValidationError({"detail": "La factura ya tiene un documento fiscal."})

    provider = get_provider()
    result = provider.emit(invoice)
    if existing:
        existing.delete()
    return FiscalDocument.objects.create(
        invoice=invoice,
        cufe=result.cufe,
        protocol=result.protocol,
        fiscal_status=result.status,
        environment=result.environment,
        provider=provider.name,
    )


def void_fiscal_document(*, invoice) -> None:
    doc = getattr(invoice, "fiscal", None)
    if not doc or doc.fiscal_status == FiscalDocument.FiscalStatus.CANCELLED:
        return
    get_provider().void(doc)
    doc.fiscal_status = FiscalDocument.FiscalStatus.CANCELLED
    doc.cancelled_at = timezone.now()
    doc.save(update_fields=["fiscal_status", "cancelled_at", "updated_at"])
