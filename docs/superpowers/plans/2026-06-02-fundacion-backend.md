# Fundación Backend Veragro ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la fundación backend del ERP Veragro: scaffold Docker-first, proyecto Django modular, Custom User con JWT, y el slice vertical CRUD de Clientes, todo con tests en verde.

**Architecture:** Monolito modular Django + DRF corriendo en Docker (postgres 16, redis 7, backend). Settings divididos (base/development/production). Apps por dominio en `backend/apps/` — la mayoría vacías; `core`, `users` y `customers` con contenido real. Auth por JWT (simplejwt), OpenAPI con drf-spectacular, CORS habilitado.

**Tech Stack:** Python 3.12, Django 5.x, Django REST Framework, djangorestframework-simplejwt, drf-spectacular, django-cors-headers, django-environ, PostgreSQL 16, Redis 7, pytest-django, Docker Compose.

---

## Convenciones de este plan

- Todos los comandos de Django/pytest se ejecutan **dentro del contenedor**:
  `docker compose exec backend <comando>`. Durante el scaffold inicial (antes de que el
  contenedor levante) algunos comandos se documentan explícitamente.
- Rutas siempre relativas a la raíz del repo `C:/Users/victo/Proyectos/VerAgro-ERP`.
- Cada tarea termina en commit. Mensajes en español, estilo conventional commits.
- El repo ya está inicializado (git) y contiene el documento y los specs.

---

## Task 1: Archivos de entorno y Docker base

**Files:**
- Create: `.env.example`
- Create: `.env`
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `docker-compose.yml`

- [ ] **Step 1: Crear `backend/requirements.txt`**

```text
Django==5.1.4
djangorestframework==3.15.2
djangorestframework-simplejwt==5.3.1
drf-spectacular==0.28.0
django-cors-headers==4.6.0
django-environ==0.11.2
psycopg[binary]==3.2.3
gunicorn==23.0.0
pytest==8.3.4
pytest-django==4.9.0
```

- [ ] **Step 2: Crear `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

- [ ] **Step 3: Crear `.env.example`**

```env
# Django
DJANGO_SECRET_KEY=change-me-in-production
DJANGO_DEBUG=True
DJANGO_SETTINGS_MODULE=config.settings.development
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend

# Database
DATABASE_NAME=veragro_erp
DATABASE_USER=veragro_user
DATABASE_PASSWORD=veragro_password
DATABASE_HOST=db
DATABASE_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

- [ ] **Step 4: Crear `.env` (copia con valores de desarrollo)**

Mismo contenido que `.env.example` (los valores de dev sirven tal cual). Está en
`.gitignore`, no se versiona.

- [ ] **Step 5: Crear `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${DATABASE_NAME}
      POSTGRES_USER: ${DATABASE_USER}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DATABASE_USER} -d ${DATABASE_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  # Diferido a MVP6 (no hay tareas async todavía):
  # celery_worker:
  #   build: ./backend
  #   command: celery -A config worker -l info
  #   volumes:
  #     - ./backend:/app
  #   env_file: [.env]
  #   depends_on: [redis, db]

volumes:
  postgres_data:
```

- [ ] **Step 6: Commit**

```bash
git add .env.example backend/Dockerfile backend/requirements.txt docker-compose.yml
git commit -m "build: scaffold Docker y dependencias del backend"
```

---

## Task 2: Proyecto Django y settings divididos

**Files:**
- Create: `backend/manage.py`
- Create: `backend/config/__init__.py`
- Create: `backend/config/settings/__init__.py`
- Create: `backend/config/settings/base.py`
- Create: `backend/config/settings/development.py`
- Create: `backend/config/settings/production.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/config/asgi.py`

- [ ] **Step 1: Crear `backend/manage.py`**

```python
#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Crear `backend/config/__init__.py` y `backend/config/settings/__init__.py`**

Ambos archivos vacíos.

- [ ] **Step 3: Crear `backend/config/settings/base.py`**

```python
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="insecure-dev-key")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
]

LOCAL_APPS = [
    "apps.core",
    "apps.users",
    "apps.customers",
    "apps.equipment",
    "apps.inventory",
    "apps.suppliers",
    "apps.purchasing",
    "apps.service_orders",
    "apps.checklists",
    "apps.billing",
    "apps.reports",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DATABASE_NAME", default="veragro_erp"),
        "USER": env("DATABASE_USER", default="veragro_user"),
        "PASSWORD": env("DATABASE_PASSWORD", default="veragro_password"),
        "HOST": env("DATABASE_HOST", default="db"),
        "PORT": env("DATABASE_PORT", default="5432"),
    }
}

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es"
TIME_ZONE = "America/Panama"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "static"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Veragro ERP API",
    "DESCRIPTION": "API del ERP modular Veragro",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
```

- [ ] **Step 4: Crear `backend/config/settings/development.py`**

```python
from .base import *  # noqa

DEBUG = True
ALLOWED_HOSTS = ["*"]
```

- [ ] **Step 5: Crear `backend/config/settings/production.py`**

```python
from .base import *  # noqa

DEBUG = False

# Hosts y CORS deben venir del entorno en producción.
# Gunicorn sirve la app (ver comando de despliegue), Nginx en Proxmox hace de proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
```

- [ ] **Step 6: Crear `backend/config/urls.py`**

```python
from django.contrib import admin
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]
```

- [ ] **Step 7: Crear `backend/config/wsgi.py`**

```python
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
application = get_wsgi_application()
```

- [ ] **Step 8: Crear `backend/config/asgi.py`**

```python
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
application = get_asgi_application()
```

- [ ] **Step 9: Commit**

```bash
git add backend/manage.py backend/config
git commit -m "feat: proyecto Django con settings divididos y DRF"
```

---

## Task 3: Apps de dominio (vacías) y app core

**Files:**
- Create: `backend/apps/__init__.py`
- Create (por cada app `core`, `users`, `customers`, `equipment`, `inventory`, `suppliers`, `purchasing`, `service_orders`, `checklists`, `billing`, `reports`):
  `backend/apps/<app>/__init__.py`, `backend/apps/<app>/apps.py`, `backend/apps/<app>/migrations/__init__.py`
- Create: `backend/apps/core/models.py`
- Create: `backend/apps/core/permissions.py`

- [ ] **Step 1: Crear `backend/apps/__init__.py`** (vacío)

- [ ] **Step 2: Crear los paquetes de cada app**

Para cada app de la lista (`core`, `users`, `customers`, `equipment`, `inventory`,
`suppliers`, `purchasing`, `service_orders`, `checklists`, `billing`, `reports`):

`backend/apps/<app>/__init__.py` → vacío
`backend/apps/<app>/migrations/__init__.py` → vacío
`backend/apps/<app>/apps.py` → (sustituir `<App>` por el nombre en PascalCase y `<app>` por el nombre):

```python
from django.apps import AppConfig


class <App>Config(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.<app>"
```

Ejemplo para `service_orders`: clase `ServiceOrdersConfig`, `name = "apps.service_orders"`.

- [ ] **Step 3: Crear `backend/apps/core/models.py`**

```python
from django.db import models


class TimeStampedModel(models.Model):
    """Base abstracta con timestamps de creación y actualización."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

- [ ] **Step 4: Crear `backend/apps/core/permissions.py`**

```python
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    """Permite acceso solo a usuarios con rol admin."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "admin"
        )


class IsAdminOrReadOnly(BasePermission):
    """Lectura para cualquier autenticado; escritura solo para admin."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role == "admin"
```

- [ ] **Step 5: Verificar que Django reconoce las apps**

Levantar primero la base (necesaria para los siguientes pasos):

```bash
docker compose up -d db redis
docker compose build backend
docker compose run --rm backend python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 6: Commit**

```bash
git add backend/apps
git commit -m "feat: apps de dominio y modelo/permisos base en core"
```

---

## Task 4: Custom User model

**Files:**
- Create: `backend/apps/users/models.py`
- Create: `backend/apps/users/admin.py`
- Create: `backend/apps/users/tests/__init__.py`
- Create: `backend/apps/users/tests/test_models.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Crear `backend/pytest.ini`**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.development
python_files = test_*.py
```

- [ ] **Step 2: Escribir el test que falla — `backend/apps/users/tests/__init__.py`** (vacío) y `backend/apps/users/tests/test_models.py`

```python
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
    assert admin.role == "admin"


@pytest.mark.django_db
def test_email_is_required():
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="x", full_name="Sin Email")
```

- [ ] **Step 3: Ejecutar el test para verificar que falla**

```bash
docker compose run --rm backend pytest apps/users/tests/test_models.py -v
```

Expected: FAIL (el modelo User aún no existe / no tiene `role`).

- [ ] **Step 4: Implementar `backend/apps/users/models.py`**

```python
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from apps.core.models import TimeStampedModel


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("El email es obligatorio")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "admin")
        if extra_fields.get("is_staff") is not True:
            raise ValueError("El superusuario debe tener is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("El superusuario debe tener is_superuser=True")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrador"
        TECHNICIAN = "technician", "Técnico"
        SALES = "sales", "Vendedor / Facturación"
        INVENTORY = "inventory", "Inventario / Compras"
        READONLY = "readonly", "Consulta / Lectura"

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    role = models.CharField(
        max_length=20, choices=Role.choices, default=Role.TECHNICIAN
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    def __str__(self):
        return self.email
```

- [ ] **Step 5: Crear `backend/apps/users/admin.py`**

```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name", "role", "is_active", "is_staff")
    search_fields = ("email", "full_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Información", {"fields": ("full_name", "role")}),
        ("Permisos", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "full_name", "role", "password1", "password2"),
        }),
    )
```

- [ ] **Step 6: Generar migraciones y correr el test**

```bash
docker compose run --rm backend python manage.py makemigrations users
docker compose run --rm backend pytest apps/users/tests/test_models.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/users backend/pytest.ini
git commit -m "feat: custom user model con login por email y roles"
```

---

## Task 5: Autenticación JWT (login, refresh, me)

**Files:**
- Modify: `backend/config/settings/base.py` (añadir `rest_framework_simplejwt` no requiere INSTALLED_APPS, pero sí las urls)
- Create: `backend/apps/users/serializers.py`
- Create: `backend/apps/users/views.py`
- Create: `backend/apps/users/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/users/tests/test_auth.py`

- [ ] **Step 1: Escribir el test que falla — `backend/apps/users/tests/test_auth.py`**

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="tech@veragro.com", password="secret123", full_name="Tec Uno"
    )


@pytest.mark.django_db
def test_login_returns_tokens(user):
    client = APIClient()
    resp = client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": "secret123"},
        format="json",
    )
    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


@pytest.mark.django_db
def test_me_requires_authentication():
    client = APIClient()
    resp = client.get("/api/auth/me/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_returns_current_user(user):
    client = APIClient()
    login = client.post(
        "/api/auth/login/",
        {"email": "tech@veragro.com", "password": "secret123"},
        format="json",
    )
    token = login.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/auth/me/")
    assert resp.status_code == 200
    assert resp.data["email"] == "tech@veragro.com"
    assert resp.data["role"] == "technician"
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

```bash
docker compose run --rm backend pytest apps/users/tests/test_auth.py -v
```

Expected: FAIL (rutas `/api/auth/...` no existen → 404).

- [ ] **Step 3: Crear `backend/apps/users/serializers.py`**

```python
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "full_name", "role", "is_active")
        read_only_fields = ("id", "is_active")
```

- [ ] **Step 4: Crear `backend/apps/users/views.py`**

```python
from rest_framework import generics, permissions

from .serializers import UserSerializer


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
```

- [ ] **Step 5: Crear `backend/apps/users/urls.py`**

```python
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import MeView

urlpatterns = [
    path("login/", TokenObtainPairView.as_view(), name="auth-login"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
]
```

Nota: `TokenObtainPairView` usa `USERNAME_FIELD` (email), por lo que el login espera
`{"email": ..., "password": ...}` automáticamente.

- [ ] **Step 6: Modificar `backend/config/urls.py` para incluir las rutas de auth**

Reemplazar el contenido por:

```python
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/auth/", include("apps.users.urls")),
]
```

- [ ] **Step 7: Correr el test**

```bash
docker compose run --rm backend pytest apps/users/tests/test_auth.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/users backend/config/urls.py
git commit -m "feat: autenticación JWT con login, refresh y me"
```

---

## Task 6: Tests de permisos por rol

**Files:**
- Create: `backend/apps/core/tests/__init__.py`
- Create: `backend/apps/core/tests/test_permissions.py`

- [ ] **Step 1: Escribir el test — `backend/apps/core/tests/test_permissions.py`**

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.core.permissions import IsAdmin, IsAdminOrReadOnly

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
```

- [ ] **Step 2: Crear `backend/apps/core/tests/__init__.py`** (vacío)

- [ ] **Step 3: Correr el test**

```bash
docker compose run --rm backend pytest apps/core/tests/test_permissions.py -v
```

Expected: 4 tests PASS (las clases de permiso ya existen de la Task 3).

- [ ] **Step 4: Commit**

```bash
git add backend/apps/core/tests
git commit -m "test: permisos por rol IsAdmin e IsAdminOrReadOnly"
```

---

## Task 7: Modelo Customer

**Files:**
- Create: `backend/apps/customers/models.py`
- Create: `backend/apps/customers/admin.py`
- Create: `backend/apps/customers/tests/__init__.py`
- Create: `backend/apps/customers/tests/test_models.py`

- [ ] **Step 1: Escribir el test — `backend/apps/customers/tests/test_models.py`**

```python
import pytest

from apps.customers.models import Customer


@pytest.mark.django_db
def test_create_customer():
    c = Customer.objects.create(
        customer_type="company",
        name="Agro SA",
        identification_type="ruc",
        identification_number="155-123-456",
    )
    assert c.is_active is True
    assert str(c) == "Agro SA"
    assert c.created_at is not None


@pytest.mark.django_db
def test_customer_defaults():
    c = Customer.objects.create(name="Juan Perez")
    assert c.customer_type == "person"
    assert c.is_active is True
```

- [ ] **Step 2: Crear `backend/apps/customers/tests/__init__.py`** (vacío)

- [ ] **Step 3: Ejecutar el test para verificar que falla**

```bash
docker compose run --rm backend pytest apps/customers/tests/test_models.py -v
```

Expected: FAIL (no existe el modelo Customer).

- [ ] **Step 4: Implementar `backend/apps/customers/models.py`**

```python
from django.db import models

from apps.core.models import TimeStampedModel


class Customer(TimeStampedModel):
    class CustomerType(models.TextChoices):
        PERSON = "person", "Persona"
        COMPANY = "company", "Empresa"

    class IdentificationType(models.TextChoices):
        CEDULA = "cedula", "Cédula"
        RUC = "ruc", "RUC"
        PASSPORT = "passport", "Pasaporte"
        OTHER = "other", "Otro"

    customer_type = models.CharField(
        max_length=20, choices=CustomerType.choices, default=CustomerType.PERSON
    )
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    identification_type = models.CharField(
        max_length=20, choices=IdentificationType.choices, blank=True
    )
    identification_number = models.CharField(max_length=50, blank=True)
    dv = models.CharField(max_length=10, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    province = models.CharField(max_length=100, blank=True)
    district = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name
```

- [ ] **Step 5: Crear `backend/apps/customers/admin.py`**

```python
from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "customer_type", "identification_number", "phone", "is_active")
    list_filter = ("customer_type", "is_active")
    search_fields = ("name", "identification_number", "phone", "email")
```

- [ ] **Step 6: Generar migraciones y correr el test**

```bash
docker compose run --rm backend python manage.py makemigrations customers
docker compose run --rm backend pytest apps/customers/tests/test_models.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/customers
git commit -m "feat: modelo Customer con campos del documento"
```

---

## Task 8: API CRUD de Customers (búsqueda + soft-delete)

**Files:**
- Create: `backend/apps/customers/serializers.py`
- Create: `backend/apps/customers/views.py`
- Create: `backend/apps/customers/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/customers/tests/test_api.py`

- [ ] **Step 1: Escribir el test — `backend/apps/customers/tests/test_api.py`**

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer

User = get_user_model()


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(
        email="admin@veragro.com", password="x", full_name="Admin", role="admin"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_create_customer(auth_client):
    resp = auth_client.post(
        "/api/customers/",
        {"name": "Agro SA", "customer_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Agro SA"


@pytest.mark.django_db
def test_list_excludes_inactive_by_default(auth_client):
    Customer.objects.create(name="Activo")
    Customer.objects.create(name="Inactivo", is_active=False)
    resp = auth_client.get("/api/customers/")
    names = [c["name"] for c in resp.data["results"]]
    assert "Activo" in names
    assert "Inactivo" not in names


@pytest.mark.django_db
def test_search_by_phone(auth_client):
    Customer.objects.create(name="Uno", phone="6000-1111")
    Customer.objects.create(name="Dos", phone="6000-2222")
    resp = auth_client.get("/api/customers/?search=1111")
    names = [c["name"] for c in resp.data["results"]]
    assert names == ["Uno"]


@pytest.mark.django_db
def test_delete_is_soft(auth_client):
    c = Customer.objects.create(name="Borrar")
    resp = auth_client.delete(f"/api/customers/{c.id}/")
    assert resp.status_code == 204
    c.refresh_from_db()
    assert c.is_active is False  # sigue existiendo, marcado inactivo


@pytest.mark.django_db
def test_requires_authentication():
    client = APIClient()
    resp = client.get("/api/customers/")
    assert resp.status_code == 401
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

```bash
docker compose run --rm backend pytest apps/customers/tests/test_api.py -v
```

Expected: FAIL (ruta `/api/customers/` no existe → 404).

- [ ] **Step 3: Crear `backend/apps/customers/serializers.py`**

```python
from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        id_type = attrs.get("identification_type")
        id_number = attrs.get("identification_number")
        if id_type and not id_number:
            raise serializers.ValidationError(
                "Debe indicar el número de identificación si especifica el tipo."
            )
        return attrs
```

- [ ] **Step 4: Crear `backend/apps/customers/views.py`**

```python
from rest_framework import filters, viewsets

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "identification_number", "phone", "email"]

    def get_queryset(self):
        qs = Customer.objects.all()
        include_inactive = self.request.query_params.get("include_inactive")
        if include_inactive not in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
```

- [ ] **Step 5: Crear `backend/apps/customers/urls.py`**

```python
from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")

urlpatterns = router.urls
```

- [ ] **Step 6: Modificar `backend/config/urls.py` para incluir las rutas de customers**

Añadir el include de customers. El bloque `urlpatterns` queda:

```python
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/auth/", include("apps.users.urls")),
    path("api/", include("apps.customers.urls")),
]
```

- [ ] **Step 7: Correr el test**

```bash
docker compose run --rm backend pytest apps/customers/tests/test_api.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/customers backend/config/urls.py
git commit -m "feat: API CRUD de clientes con búsqueda y soft-delete"
```

---

## Task 9: Endpoints de historial de cliente (placeholders funcionales)

**Files:**
- Modify: `backend/apps/customers/views.py`
- Modify: `backend/apps/customers/tests/test_api.py`

- [ ] **Step 1: Añadir el test al final de `backend/apps/customers/tests/test_api.py`**

```python
@pytest.mark.django_db
def test_history_endpoints_return_empty(auth_client):
    c = Customer.objects.create(name="Con Historial")
    for sub in ("service-orders", "invoices", "equipment"):
        resp = auth_client.get(f"/api/customers/{c.id}/{sub}/")
        assert resp.status_code == 200
        assert resp.data == []
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

```bash
docker compose run --rm backend pytest apps/customers/tests/test_api.py::test_history_endpoints_return_empty -v
```

Expected: FAIL (404, las rutas de historial no existen).

- [ ] **Step 3: Añadir las acciones al `CustomerViewSet` en `backend/apps/customers/views.py`**

Añadir el import y las tres acciones dentro de la clase:

```python
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "identification_number", "phone", "email"]

    def get_queryset(self):
        qs = Customer.objects.all()
        include_inactive = self.request.query_params.get("include_inactive")
        if include_inactive not in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    # Placeholders: devuelven vacío hasta que existan los módulos correspondientes.
    @action(detail=True, methods=["get"], url_path="service-orders")
    def service_orders(self, request, pk=None):
        self.get_object()  # valida existencia / 404
        return Response([])  # TODO: conectar con módulo service_orders

    @action(detail=True, methods=["get"])
    def invoices(self, request, pk=None):
        self.get_object()
        return Response([])  # TODO: conectar con módulo billing

    @action(detail=True, methods=["get"])
    def equipment(self, request, pk=None):
        self.get_object()
        return Response([])  # TODO: conectar con módulo equipment
```

- [ ] **Step 4: Correr el test**

```bash
docker compose run --rm backend pytest apps/customers/tests/test_api.py::test_history_endpoints_return_empty -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/customers
git commit -m "feat: endpoints de historial de cliente (placeholders vacíos)"
```

---

## Task 10: Verificación integral de arranque

**Files:** ninguno (verificación end-to-end).

- [ ] **Step 1: Correr toda la suite de tests**

```bash
docker compose run --rm backend pytest -v
```

Expected: todos los tests PASS (users: 6, core: 4, customers: 8 ≈ 18 tests).

- [ ] **Step 2: Levantar todo el stack**

```bash
docker compose up -d --build
docker compose ps
```

Expected: `db`, `redis`, `backend` en estado `running`/`healthy`.

- [ ] **Step 3: Aplicar migraciones**

```bash
docker compose exec backend python manage.py migrate
```

Expected: todas las migraciones aplicadas sin error.

- [ ] **Step 4: Verificar OpenAPI / Swagger**

Abrir en el navegador `http://localhost:8000/api/docs/`.
Expected: carga Swagger UI con los endpoints de auth y customers.

- [ ] **Step 5: Crear superusuario y probar login**

```bash
docker compose exec backend python manage.py createsuperuser --email admin@veragro.com --full_name "Admin"
```

Probar login (PowerShell):

```powershell
curl.exe -s -X POST http://localhost:8000/api/auth/login/ -H "Content-Type: application/json" -d '{\"email\":\"admin@veragro.com\",\"password\":\"<la-que-pusiste>\"}'
```

Expected: respuesta JSON con `access` y `refresh`.

- [ ] **Step 6: Probar CRUD de cliente con el token**

Usar el `access` token del paso anterior:

```powershell
curl.exe -s -X POST http://localhost:8000/api/customers/ -H "Authorization: Bearer <access>" -H "Content-Type: application/json" -d '{\"name\":\"Cliente Prueba\",\"customer_type\":\"company\"}'
curl.exe -s http://localhost:8000/api/customers/ -H "Authorization: Bearer <access>"
```

Expected: creación 201 y listado con el cliente creado.

- [ ] **Step 7: Commit final (si hay ajustes pendientes)**

```bash
git add -A
git commit -m "chore: verificación integral de la fundación backend"
```

---

## Resultado esperado

Al completar las 10 tareas:

- `docker compose up` levanta `db`, `redis` y `backend`.
- Migraciones limpias.
- Login JWT funcional (`/api/auth/login`, `/refresh`, `/me`).
- CRUD de clientes con búsqueda y soft-delete, más endpoints de historial vacíos.
- API documentada en `/api/docs/`.
- ~18 tests de pytest en verde.

Esto cumple los criterios de aceptación del spec `2026-06-02-fundacion-backend-design.md`
y deja la base lista para el siguiente sub-proyecto (módulo Equipos).
