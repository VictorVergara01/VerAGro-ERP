import os
from django.core.asgi import get_asgi_application

# En producción, DJANGO_SETTINGS_MODULE debe fijarse a config.settings.production en el entorno.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
application = get_asgi_application()
