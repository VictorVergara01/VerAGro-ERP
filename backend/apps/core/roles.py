"""Fuente única de la matriz de roles/permisos del ERP.

Los códigos deben coincidir con ``apps.users.models.User.Role``. Las clases de
permiso (``RoleWriteOrReadOnly``, ``role_required``) consumen estos grupos.
"""

# --- Códigos de rol ---
SUPER_ADMIN = "super_admin"
GENERAL_ADMIN = "general_admin"
SALES = "sales"
TECHNICIAN = "technician"
INVENTORY = "inventory"
ACCOUNTING = "accounting"
READONLY = "readonly"

# --- Grupos base ---
SUPER = (SUPER_ADMIN,)
ADMINS = (SUPER_ADMIN, GENERAL_ADMIN)

# --- Grupos de escritura por área ---
COMPANY_CONFIG_WRITE = SUPER
CHECKLIST_TEMPLATE_WRITE = ADMINS
LOOKUPS_WRITE = (*ADMINS, INVENTORY)            # categorías de inventario, tipos de equipo
INVENTORY_WRITE = (*ADMINS, INVENTORY)          # productos, ajustes, compras, proveedores
EQUIPMENT_WRITE = (*ADMINS, TECHNICIAN, SALES, INVENTORY)
CUSTOMERS_WRITE = (*ADMINS, SALES, TECHNICIAN, INVENTORY)
SERVICE_WRITE = (*ADMINS, TECHNICIAN)
BILLING_WRITE = (*ADMINS, SALES)                # cotizaciones/facturas (crear/editar/emitir/anular)
PAYMENTS_WRITE = (*ADMINS, ACCOUNTING)          # registrar pago
FINANCIAL_READ = (*ADMINS, SALES, ACCOUNTING)   # reportes financieros
USERS_WRITE = ADMINS                            # gestión de usuarios (alta/edición/baja)
