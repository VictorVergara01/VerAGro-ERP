from rest_framework.throttling import SimpleRateThrottle


def client_ip(request):
    """IP real del cliente.

    En producción el backend está detrás de Cloudflare Tunnel: REMOTE_ADDR es la
    IP del contenedor cloudflared para todas las peticiones, y la del cliente
    llega en CF-Connecting-IP. Si el backend se expone sin el túnel
    (BIND_ADDR=0.0.0.0), esa cabecera la puede falsear quien llegue directo.
    """
    return request.META.get("HTTP_CF_CONNECTING_IP", "").strip() or request.META.get(
        "REMOTE_ADDR", ""
    )


class LoginRateThrottle(SimpleRateThrottle):
    """Limita los intentos de login por IP (tasa en DEFAULT_THROTTLE_RATES["login"]).

    La caché es la de Django (LocMem por defecto, una por worker de Gunicorn), así
    que el tope efectivo es la tasa multiplicada por el número de workers.
    """

    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request)}
