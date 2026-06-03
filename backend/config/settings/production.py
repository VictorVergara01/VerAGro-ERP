from .base import env  # noqa
from .base import *  # noqa

DEBUG = False

# En producción estas variables son OBLIGATORIAS (sin default): si faltan,
# django-environ lanza ImproperlyConfigured y la app se niega a arrancar,
# evitando correr con SECRET_KEY inseguro o hosts/CORS abiertos por defecto.
SECRET_KEY = env("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")

# Gunicorn sirve la app; Nginx en Proxmox hace de reverse proxy y termina TLS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
