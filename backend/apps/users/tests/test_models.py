import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_create_user_with_email():
    user = User.objects.create_user(
        email="tech@veragro.com", password="secret123", full_name="Tec Uno"
    )
    assert user.email == "tech@veragro.com"
    assert user.role == "technician"  # rol por defecto
    assert user.check_password("secret123")
    assert user.is_active is True
    assert user.is_staff is False


@pytest.mark.django_db
def test_create_superuser():
    admin = User.objects.create_superuser(
        email="admin@veragro.com", password="secret123", full_name="Admin"
    )
    assert admin.is_staff is True
    assert admin.is_superuser is True
    assert admin.role == "super_admin"


@pytest.mark.django_db
def test_email_is_required():
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="x", full_name="Sin Email")


@pytest.mark.django_db
def test_duplicate_email_raises():
    from django.db import IntegrityError

    User.objects.create_user(email="dup@veragro.com", password="x", full_name="A")
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="dup@veragro.com", password="y", full_name="B")
