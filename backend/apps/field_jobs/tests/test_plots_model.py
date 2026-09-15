"""Reglas de integridad del lote: unicidad del nombre entre lotes activos."""
import pytest
from django.db import IntegrityError

from apps.customers.models import Customer
from apps.field_jobs.models import FieldPlot

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca La Esperanza")


def test_no_repite_nombre_entre_lotes_activos_del_mismo_cliente(customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    with pytest.raises(IntegrityError):
        FieldPlot.objects.create(customer=customer, name="Potrero 1")


def test_permite_repetir_el_nombre_si_el_otro_esta_desactivado(customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1", is_active=False)
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert plot.is_active is True


def test_mismo_nombre_en_clientes_distintos_es_valido(customer):
    otro = Customer.objects.create(name="Finca Santa Rita")
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert FieldPlot.objects.create(customer=otro, name="Potrero 1").pk


def test_str_es_el_nombre(customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert str(plot) == "Potrero 1"


def test_defaults_del_lote(customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert plot.crop == "rice"
    assert plot.hectares == 1
    assert plot.water_per_hectare is None
    assert plot.is_active is True
