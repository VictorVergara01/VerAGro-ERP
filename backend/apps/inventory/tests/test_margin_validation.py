from decimal import Decimal

import pytest

from apps.inventory.models import Product, ProductCategory
from apps.inventory.serializers import ProductCategorySerializer, ProductSerializer
from apps.inventory.validators import margin_triplet_errors


def test_trio_valido_no_reporta_errores():
    assert margin_triplet_errors(Decimal("25"), Decimal("30"), Decimal("45")) == {}


def test_minimo_mayor_que_maximo():
    errors = margin_triplet_errors(Decimal("50"), Decimal("30"), Decimal("40"))
    assert "min_margin_percentage" in errors


def test_objetivo_fuera_del_rango_por_abajo():
    errors = margin_triplet_errors(Decimal("30"), Decimal("20"), Decimal("45"))
    assert "min_margin_percentage" in errors


def test_objetivo_fuera_del_rango_por_arriba():
    errors = margin_triplet_errors(Decimal("10"), Decimal("50"), Decimal("40"))
    assert "max_margin_percentage" in errors


def test_cero_significa_no_configurado_y_no_participa():
    # Sólo objetivo configurado: no hay nada contra qué comparar.
    assert margin_triplet_errors(Decimal("0"), Decimal("30"), Decimal("0")) == {}
    # Mínimo y objetivo, sin techo.
    assert margin_triplet_errors(Decimal("20"), Decimal("30"), Decimal("0")) == {}
    # Objetivo sin configurar, rango sí: válido mientras min <= max.
    assert margin_triplet_errors(Decimal("20"), Decimal("0"), Decimal("40")) == {}


def test_none_se_trata_como_cero():
    assert margin_triplet_errors(None, Decimal("30"), None) == {}


@pytest.mark.django_db
def test_serializer_rechaza_minimo_sobre_maximo():
    s = ProductSerializer(
        data={
            "name": "Pieza",
            "min_margin_percentage": "50",
            "default_margin_percentage": "30",
            "max_margin_percentage": "40",
        }
    )
    assert not s.is_valid()
    assert "min_margin_percentage" in s.errors


@pytest.mark.django_db
def test_serializer_acepta_trio_valido():
    s = ProductSerializer(
        data={
            "name": "Pieza",
            "min_margin_percentage": "25",
            "default_margin_percentage": "30",
            "max_margin_percentage": "45",
        }
    )
    assert s.is_valid(), s.errors
    product = s.save()
    assert Product.objects.filter(pk=product.pk).exists()


@pytest.mark.django_db
def test_category_serializer_rechaza_minimo_sobre_maximo():
    s = ProductCategorySerializer(
        data={
            "name": "Filtros",
            "min_margin_percentage": "50",
            "default_margin_percentage": "30",
            "max_margin_percentage": "40",
        }
    )
    assert not s.is_valid()
    assert "min_margin_percentage" in s.errors


@pytest.mark.django_db
def test_category_serializer_acepta_trio_valido():
    s = ProductCategorySerializer(
        data={
            "name": "Filtros",
            "min_margin_percentage": "25",
            "default_margin_percentage": "30",
            "max_margin_percentage": "45",
        }
    )
    assert s.is_valid(), s.errors
    category = s.save()
    assert ProductCategory.objects.filter(pk=category.pk).exists()
