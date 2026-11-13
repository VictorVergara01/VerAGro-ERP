"""Importa los repuestos reales del DJI Agras T50 desde el Excel maestro.

Idempotente por número OEM de DJI. Conserva los SKU de cada posición como
referencias y una compatibilidad por sección, compartiendo las existencias.
NO inventa números OEM: si la fila no trae 'Numero de Pieza', part_number queda vacío.
"""
import re
import unicodedata
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from openpyxl import load_workbook

from apps.equipment.models import EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility, ProductCategory, ProductAlias

SHEET = "T50 Todas las Partes"

# Excel (normalizado) -> (code, nombre visible)
CATEGORY_MAP = {
    "protector frontal": ("protector_frontal", "Protector frontal"),
    "m1-m2 brazos": ("brazos_m1_m2", "Brazos M1-M2"),
    "m3-m4 brazo": ("brazos_m3_m4", "Brazos M3-M4"),
    "chasis frontal": ("chasis_frontal", "Chasis frontal"),
    "chasis intermedio": ("chasis_intermedio", "Chasis intermedio"),
    "chasis trasero": ("chasis_trasero", "Chasis trasero"),
    "tren de aterrizaje": ("tren_aterrizaje", "Tren de aterrizaje"),
    "cableado de chasis": ("cableado_chasis", "Cableado de chasis"),
    "modulo de distribucion": ("modulo_distribucion", "Módulo de distribución"),
    "tanque de fumigacion": ("tanque_fumigacion", "Tanque de fumigación"),
    "sistema centrifugo": ("sistema_centrifugo", "Sistema centrífugo"),
    "helices": ("helices", "Hélices"),
}


def _norm(text):
    text = (text or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


class Command(BaseCommand):
    help = "Importa los repuestos reales del DJI Agras T50 desde el Excel maestro."

    def add_arguments(self, parser):
        parser.add_argument("xlsx", help="Ruta al archivo .xlsx")
        parser.add_argument("--dry-run", action="store_true", help="Muestra la consolidación sin modificar datos.")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            model = EquipmentModel.objects.get(model_code="T50")
        except EquipmentModel.DoesNotExist:
            raise CommandError(
                "No existe el modelo técnico T50. Corre primero seed_equipment_catalog."
            )
        except EquipmentModel.MultipleObjectsReturned:
            raise CommandError(
                "Hay más de un modelo con model_code='T50'; resuélvelo antes de importar."
            )

        wb = load_workbook(options["xlsx"], read_only=True, data_only=True)
        groups = defaultdict(list)
        source_skus = {}
        try:
            if SHEET not in wb.sheetnames:
                raise CommandError(f"El archivo no tiene la hoja '{SHEET}'.")
            for row in wb[SHEET].iter_rows(min_row=2, values_only=True):
                if len(row) < 3:
                    continue
                sku, part, name = [str(v).strip() if v is not None else "" for v in row[:3]]
                if not sku or not name:
                    continue
                key = ("oem", part.upper()) if part else ("sku", sku)
                if sku in source_skus and source_skus[sku] != key:
                    raise CommandError(f"El SKU {sku} tiene números OEM contradictorios en el Excel.")
                source_skus[sku] = key
                groups[key].append({"sku": sku, "part": part, "name": name, "category": row[4] if len(row) > 4 else None})
        finally:
            wb.close()
        if not groups:
            raise CommandError("La hoja no contiene piezas válidas.")

        # Las reservas, conteos y movimientos usan el mismo bloqueo del producto.
        list(Product.objects.select_for_update().values_list("pk", flat=True))
        plan, assigned_ids = [], set()
        numeric_fields = ("average_cost", "last_purchase_cost", "sale_price", "min_sale_price", "max_sale_price", "minimum_stock", "default_margin_percentage", "min_margin_percentage", "max_margin_percentage", "is_active")
        for key, rows in groups.items():
            if len({_norm(row["name"]) for row in rows}) != 1:
                raise CommandError(f"El número {key[1]} tiene nombres contradictorios; requiere revisión.")
            skus = [row["sku"] for row in rows]
            lookup = Q(sku__in=skus) | Q(aliases__sku__in=skus)
            if key[0] == "oem":
                lookup |= Q(part_number__iexact=key[1]) & (Q(brand__iexact=model.brand) | Q(brand=""))
            candidates = list(Product.objects.filter(lookup).distinct().order_by("pk"))
            for product in candidates:
                if product.pk in assigned_ids:
                    raise CommandError(f"El producto {product.sku} coincide con más de una identidad del Excel.")
                assigned_ids.add(product.pk)
                if product.brand and product.brand.casefold() != model.brand.casefold():
                    raise CommandError(f"La marca de {product.sku} no corresponde a {model.brand}.")
                if key[0] == "oem" and product.part_number and product.part_number.strip().upper() != key[1]:
                    raise CommandError(f"El número OEM guardado para {product.sku} contradice el Excel.")
            canonical = candidates[0] if candidates else None
            duplicates = candidates[1:]
            for duplicate in duplicates:
                if duplicate.stock_quantity or duplicate.reserved_quantity:
                    raise CommandError(f"{duplicate.sku} tiene existencias o reservas; no se consolida automáticamente.")
                for relation in Product._meta.get_fields(include_hidden=True):
                    if not relation.auto_created or not (relation.one_to_many or relation.one_to_one):
                        continue
                    related = relation.related_model
                    if related in (ProductCompatibility, ProductAlias) or related._meta.auto_created:
                        continue
                    if related.objects.filter(**{relation.field.name: duplicate}).exists():
                        raise CommandError(f"{duplicate.sku} tiene referencias en {related._meta.label}; se conserva y se detiene la consolidación.")
                if any(getattr(duplicate, field) != getattr(canonical, field) for field in numeric_fields):
                    raise CommandError(f"{duplicate.sku} y {canonical.sku} tienen costos, precios o márgenes diferentes.")
                for field in ("location", "unit_of_measure", "description", "barcode", "model", "compatible_models", "main_supplier_id"):
                    values = {getattr(p, field) for p in candidates if getattr(p, field)}
                    if len(values) > 1:
                        raise CommandError(f"Los productos de {key[1]} tienen valores distintos en {field}.")
            plan.append((rows, canonical, duplicates))

        removed = sum(len(duplicates) for _, _, duplicates in plan)
        created = sum(canonical is None for _, canonical, _ in plan)
        self.stdout.write(f"Filas del Excel: {sum(len(rows) for rows in groups.values())}; repuestos distintos: {len(plan)}; productos nuevos: {created}; duplicados a consolidar: {removed}.")
        if options["dry_run"]:
            self.stdout.write("Simulación: no se modificaron productos, categorías ni existencias.")
            return

        categories = {_norm(c.name): c for c in ProductCategory.objects.all()}
        components = {}
        for rows, product, duplicates in plan:
            first = rows[0]
            if product is None:
                product = Product.objects.create(sku=first["sku"], name=first["name"], part_number=first["part"], brand=model.brand)
            for duplicate in duplicates:
                product.compatible_equipment_types.add(*duplicate.compatible_equipment_types.all())
                product.catalog_categories.add(*duplicate.catalog_categories.all())
                if duplicate.category_id:
                    product.catalog_categories.add(duplicate.category_id)
                for field in ("location", "unit_of_measure", "description", "barcode", "model", "compatible_models", "main_supplier_id"):
                    if not getattr(product, field) and getattr(duplicate, field):
                        setattr(product, field, getattr(duplicate, field))
                for compatibility in duplicate.compatibilities.all():
                    target, _ = ProductCompatibility.objects.get_or_create(
                        product=product, equipment_model=compatibility.equipment_model, component=compatibility.component,
                        defaults={"is_primary": compatibility.is_primary, "notes": compatibility.notes},
                    )
                    if compatibility.is_primary and not target.is_primary:
                        target.is_primary = True
                    if compatibility.notes and compatibility.notes not in target.notes:
                        target.notes = "\n".join(filter(None, [target.notes, compatibility.notes]))
                    target.save(update_fields=["is_primary", "notes", "updated_at"])
                ProductAlias.objects.filter(product=duplicate).update(product=product)
                ProductAlias.objects.get_or_create(sku=duplicate.sku, defaults={"product": product, "original_product_id": duplicate.pk, "original_name": duplicate.name})
                duplicate.delete()
            product.name = first["name"]
            product.part_number = first["part"] or product.part_number
            product.brand = product.brand or model.brand
            product.model = product.model or "Agras T50"
            product.unit_of_measure = product.unit_of_measure or "unidad"
            for row in rows:
                key = _norm(row["category"])
                code, name = CATEGORY_MAP.get(key, (_slug(key or "sin_categoria"), row["category"] or "Sin categoría"))
                if code not in components:
                    components[code], _ = EquipmentComponent.objects.get_or_create(
                        equipment_model=model, code=code,
                        defaults={"name": name, "component_type": EquipmentComponent.ComponentType.ASSEMBLY, "diagram_key": code, "sort_order": len(components)},
                    )
                category = categories.get(_norm(name))
                if category is None:
                    category = ProductCategory.objects.create(name=name)
                    categories[_norm(name)] = category
                product.catalog_categories.add(category)
                if product.category_id is None:
                    product.category = category
                product.compatible_equipment_types.add(model.equipment_type)
                ProductCompatibility.objects.get_or_create(product=product, equipment_model=model, component=components[code])
                if row["sku"] != product.sku:
                    alias, _ = ProductAlias.objects.get_or_create(sku=row["sku"], defaults={"product": product, "original_name": row["name"]})
                    if alias.product_id != product.pk:
                        raise CommandError(f"La referencia {row['sku']} ya pertenece a otra pieza.")
            product.save()
        self.stdout.write(self.style.SUCCESS(f"Import T50 OK: {len(plan)} repuestos, {len(components)} secciones; {removed} productos duplicados consolidados. Existencias y documentos conservados."))
