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

# --- Endurecimiento HTTPS / cookies (Nginx termina TLS) ---
# Redirige todo el tráfico a HTTPS (Nginx ya debería hacerlo; esto es defensa en
# profundidad). Las cookies de sesión/CSRF solo viajan por conexiones seguras.
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS: el navegador recuerda usar HTTPS. Empezar conservador y subir a 1 año
# (31536000) cuando se confirme que todo el dominio sirve por HTTPS sin romper nada.
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Cabeceras de seguridad adicionales.
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "DENY"

# Orígenes de confianza para CSRF (admin de Django con sesión). Mismos hosts/orígenes
# que sirven el frontend; tomados de env para no hardcodear el dominio.
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=CORS_ALLOWED_ORIGINS)

# Estáticos comprimidos y versionados servidos por WhiteNoise. Requiere correr
# `collectstatic` en el despliegue (genera el manifiesto que usa esta storage).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}
