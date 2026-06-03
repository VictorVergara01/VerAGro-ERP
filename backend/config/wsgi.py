import os
from django.core.wsgi import get_wsgi_application

# En producción, DJANGO_SETTINGS_MODULE debe fijarse a config.settings.production en el entorno.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
application = get_wsgi_application()
