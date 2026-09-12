from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.billing.models import InvoiceLine, QuoteLine
from apps.checklists.models import ServiceChecklistItem
from apps.inventory.models import InventoryMovement, Product
from apps.purchasing.models import PurchaseOrderLine
from apps.service_orders.models import ServiceOrderPart


class Command(BaseCommand):
    help = (
        "Elimina los productos de prueba (por prefijo de SKU) con sus movimientos. "
        "Por defecto sólo informa: hay que pasar --confirm para que borre."
    )

    def add_arguments(self, parser):
        parser.add_argument("--prefix", default="SKU-", help="Prefijo de SKU a purgar.")
        parser.add_argument(
            "--confirm", action="store_true", help="Ejecuta el borrado de verdad."
        )
        parser.add_argument(
            "--allow-orphans",
            action="store_true",
            help=(
                "Permite borrar aunque deje referencias sin producto "
                "(facturas, cotizaciones o checklists, SET_NULL)."
            ),
        )

    #: Piso de longitud del prefijo. Uno corto (o vacío) matchea SKUs reales del
    #: catálogo (p. ej. "T50-001") y se llevaría datos de producción. "SKU" ya
    #: entra holgado; "T50-" del catálogo real también.
    PREFIX_MIN_LENGTH = 3

    def handle(self, *args, **options):
        prefix = options["prefix"]
        if len(prefix) < self.PREFIX_MIN_LENGTH:
            raise CommandError(
                f"El prefijo '{prefix}' es demasiado corto (mínimo "
                f"{self.PREFIX_MIN_LENGTH} caracteres): con un prefijo tan corto "
                "el comando podría alcanzar productos reales del catálogo. "
                "Usa un prefijo más específico."
            )

        products = Product.objects.filter(sku__startswith=prefix)
        product_ids = list(products.values_list("id", flat=True))

        movements = InventoryMovement.objects.filter(product_id__in=product_ids)

        self.stdout.write(f"Prefijo: {prefix}")
        self.stdout.write(f"Productos a borrar: {len(product_ids)}")
        for sku in products.values_list("sku", flat=True)[:20]:
            self.stdout.write(f"  - {sku}")
        if len(product_ids) > 20:
            self.stdout.write(f"  … y {len(product_ids) - 20} más")
        self.stdout.write(f"Movimientos de inventario a borrar: {movements.count()}")

        # PROTECT: bloquean el borrado, no hay forma de continuar sin tocar
        # documentos reales de negocio (órdenes de servicio o de compra).
        # Se CALCULAN e IMPRIMEN junto con los SET_NULL antes de decidir si se
        # aborta, para que el dry-run (y un --confirm que termina abortando)
        # siempre muestre el panorama completo en una sola pasada.
        service_parts = ServiceOrderPart.objects.filter(
            product_id__in=product_ids
        ).select_related("service_order")
        purchase_lines = PurchaseOrderLine.objects.filter(
            product_id__in=product_ids
        ).select_related("purchase_order")

        blocking = []
        if service_parts.exists():
            blocking.append(
                f"{service_parts.count()} piezas de órdenes de servicio "
                "(ServiceOrderPart, PROTECT)"
            )
            for part in service_parts[:20]:
                self.stdout.write(
                    f"  - orden de servicio {part.service_order}: producto {part.product_id}"
                )
        if purchase_lines.exists():
            blocking.append(
                f"{purchase_lines.count()} líneas de orden de compra "
                "(PurchaseOrderLine, PROTECT)"
            )
            for line in purchase_lines[:20]:
                self.stdout.write(
                    f"  - orden de compra {line.purchase_order.order_number}: "
                    f"producto {line.product_id}"
                )

        # SET_NULL: NO bloquean, pero dejarían la referencia huérfana en silencio.
        # Por eso se exige autorización explícita (--allow-orphans).
        invoice_lines = InvoiceLine.objects.filter(
            product_id__in=product_ids
        ).select_related("invoice")
        quote_lines = QuoteLine.objects.filter(
            product_id__in=product_ids
        ).select_related("quote")
        checklist_items = ServiceChecklistItem.objects.filter(
            recommended_product_id__in=product_ids
        ).select_related("service_checklist")

        orphan_sources = (
            (
                "líneas de factura",
                invoice_lines,
                lambda line: (
                    f"factura {line.invoice.invoice_number}: "
                    f"{line.description or line.product_id}"
                ),
            ),
            (
                "líneas de cotización",
                quote_lines,
                lambda line: (
                    f"cotización {line.quote.quote_number}: "
                    f"{line.description or line.product_id}"
                ),
            ),
            (
                "ítems de checklist con producto recomendado",
                checklist_items,
                lambda item: f"checklist {item.service_checklist}: {item.template_item}",
            ),
        )

        orphan_count = 0
        for label, queryset, describe in orphan_sources:
            count = queryset.count()
            if not count:
                continue
            orphan_count += count
            self.stdout.write(
                self.style.WARNING(
                    f"{count} {label} quedarían sin producto (SET_NULL):"
                )
            )
            for obj in queryset[:20]:
                self.stdout.write(f"  - {describe(obj)}")

        # Con el panorama completo ya impreso (PROTECT y SET_NULL), recién ahora
        # se decide si abortar. El aborto por PROTECT tiene prioridad porque no
        # hay forma de continuar sin tocar documentos reales.
        if blocking:
            raise CommandError(
                "Hay referencias que bloquean el borrado (PROTECT): "
                + "; ".join(blocking)
                + ". Resuélvelas antes de purgar."
            )

        if not options["confirm"]:
            self.stdout.write(
                self.style.NOTICE("Simulación (--dry-run implícito). Nada fue borrado.")
            )
            return

        if orphan_count and not options["allow_orphans"]:
            raise CommandError(
                f"Hay {orphan_count} referencias que quedarían sin producto. Repite "
                "con --allow-orphans si de verdad quieres dejarlas huérfanas."
            )

        with transaction.atomic():
            deleted_movements = movements.delete()[0]
            deleted_products = products.delete()[0]

        self.stdout.write(
            self.style.SUCCESS(
                f"Borrados: {deleted_products} registros de producto, "
                f"{deleted_movements} movimientos."
            )
        )
