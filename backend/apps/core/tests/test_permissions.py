import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

from apps.core.permissions import IsAdmin, IsAdminOrReadOnly, role_required

User = get_user_model()


def _request(method, user):
    factory = APIRequestFactory()
    request = getattr(factory, method)("/fake/")
    request.user = user
    return request


@pytest.mark.django_db
def test_is_admin_allows_admin():
    admin = User.objects.create_user(
        email="a@v.com", password="x", full_name="A", role="admin"
    )
    assert IsAdmin().has_permission(_request("get", admin), None) is True


@pytest.mark.django_db
def test_is_admin_blocks_non_admin():
    tech = User.objects.create_user(
        email="t@v.com", password="x", full_name="T", role="technician"
    )
    assert IsAdmin().has_permission(_request("get", tech), None) is False


@pytest.mark.django_db
def test_is_admin_or_readonly_allows_read_for_any_authenticated():
    tech = User.objects.create_user(
        email="t2@v.com", password="x", full_name="T", role="technician"
    )
    assert IsAdminOrReadOnly().has_permission(_request("get", tech), None) is True


@pytest.mark.django_db
def test_is_admin_or_readonly_blocks_write_for_non_admin():
    tech = User.objects.create_user(
        email="t3@v.com", password="x", full_name="T", role="technician"
    )
    assert IsAdminOrReadOnly().has_permission(_request("post", tech), None) is False


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
