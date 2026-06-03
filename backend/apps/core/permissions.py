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


def role_required(*roles):
    """Fábrica de permisos parametrizable por rol.

    Uso: ``permission_classes = [role_required("admin", "sales")]``.
    Permite escritura/lectura solo a usuarios autenticados cuyo rol esté
    en ``roles``. Pensado para que cada módulo declare qué roles operan
    sobre sus recursos sin reescribir la lógica de chequeo.
    """

    allowed = set(roles)

    class RolePermission(BasePermission):
        def has_permission(self, request, view):
            return bool(
                request.user
                and request.user.is_authenticated
                and request.user.role in allowed
            )

    return RolePermission
