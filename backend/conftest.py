import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    # El throttle del login cuenta intentos en la caché; sin limpiarla, los
    # intentos de un test se arrastran al siguiente.
    cache.clear()
    yield
    cache.clear()
