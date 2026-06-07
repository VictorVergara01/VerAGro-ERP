import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

from apps.core.permissions import (
    RoleWriteOrReadOnly,
    role_required,
)

User = get_user_model()


def _request(method, user):
    factory = APIRequestFactory()
    request = getattr(factory, method)("/fake/")
    request.user = user
    return request


@pytest.mark.django_db
def test_role_required_allows_listed_role():
    sales = User.objects.create_user(
        email="s@v.com", password="x", full_name="S", role="sales"
    )
    perm = role_required("admin", "sales")()
    assert perm.has_permission(_request("post", sales), None) is True


@pytest.mark.django_db
def test_role_required_blocks_unlisted_role():
    tech = User.objects.create_user(
        email="t4@v.com", password="x", full_name="T", role="technician"
    )
    perm = role_required("admin", "sales")()
    assert perm.has_permission(_request("post", tech), None) is False


@pytest.mark.django_db
def test_role_write_or_readonly_allows_read_for_any_authenticated():
    ro = User.objects.create_user(
        email="ro@v.com", password="x", full_name="RO", role="readonly"
    )
    perm = RoleWriteOrReadOnly("admin", "technician")()
    assert perm.has_permission(_request("get", ro), None) is True


@pytest.mark.django_db
def test_role_write_or_readonly_allows_write_for_listed_role():
    tech = User.objects.create_user(
        email="tw@v.com", password="x", full_name="T", role="technician"
    )
    perm = RoleWriteOrReadOnly("admin", "technician")()
    assert perm.has_permission(_request("post", tech), None) is True


@pytest.mark.django_db
def test_role_write_or_readonly_blocks_write_for_unlisted_role():
    ro = User.objects.create_user(
        email="ro2@v.com", password="x", full_name="RO", role="readonly"
    )
    perm = RoleWriteOrReadOnly("admin", "technician")()
    assert perm.has_permission(_request("post", ro), None) is False
