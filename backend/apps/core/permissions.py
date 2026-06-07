from rest_framework.permissions import BasePermission, SAFE_METHODS


def role_required(*roles):
    """Fábrica de permisos parametrizable por rol.

    Uso: ``permission_classes = [role_required("super_admin", "sales")]``.
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


def RoleWriteOrReadOnly(*write_roles):
    """Lectura para cualquier autenticado; escritura solo para los roles dados.

    Uso: ``permission_classes = [RoleWriteOrReadOnly("super_admin", "technician")]``.
    Métodos seguros (GET/HEAD/OPTIONS) los puede usar cualquier usuario
    autenticado; la escritura queda restringida a ``write_roles``.
    """

    allowed = set(write_roles)

    class _RoleWriteOrReadOnly(BasePermission):
        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            if request.method in SAFE_METHODS:
                return True
            return request.user.role in allowed

    return _RoleWriteOrReadOnly
