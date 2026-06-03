from .base import *  # noqa

DEBUG = False

# Hosts y CORS deben venir del entorno en producción.
# Gunicorn sirve la app (ver comando de despliegue), Nginx en Proxmox hace de proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
