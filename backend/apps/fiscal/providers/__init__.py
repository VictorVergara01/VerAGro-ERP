from django.conf import settings

from .base import EmitResult, FiscalProvider
from .demo import DemoProvider

_PROVIDERS = {"demo": DemoProvider}


def get_provider() -> FiscalProvider:
    name = getattr(settings, "FISCAL_PROVIDER", "demo")
    return _PROVIDERS.get(name, DemoProvider)()


__all__ = ["EmitResult", "FiscalProvider", "DemoProvider", "get_provider"]
