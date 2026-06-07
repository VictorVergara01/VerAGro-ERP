from apps.core import roles


def test_group_membership():
    # super_admin está en todos los grupos de escritura
    for group in (
        roles.COMPANY_CONFIG_WRITE,
        roles.CHECKLIST_TEMPLATE_WRITE,
        roles.LOOKUPS_WRITE,
        roles.INVENTORY_WRITE,
        roles.EQUIPMENT_WRITE,
        roles.CUSTOMERS_WRITE,
        roles.SERVICE_WRITE,
        roles.BILLING_WRITE,
        roles.PAYMENTS_WRITE,
        roles.FINANCIAL_READ,
    ):
        assert roles.SUPER_ADMIN in group

    # general_admin opera el negocio pero NO la configuración de empresa
    assert roles.GENERAL_ADMIN in roles.INVENTORY_WRITE
    assert roles.GENERAL_ADMIN in roles.BILLING_WRITE
    assert roles.GENERAL_ADMIN not in roles.COMPANY_CONFIG_WRITE

    # contabilidad cobra y ve reportes, pero NO factura
    assert roles.ACCOUNTING in roles.PAYMENTS_WRITE
    assert roles.ACCOUNTING in roles.FINANCIAL_READ
    assert roles.ACCOUNTING not in roles.BILLING_WRITE

    # ventas factura pero NO cobra
    assert roles.SALES in roles.BILLING_WRITE
    assert roles.SALES not in roles.PAYMENTS_WRITE

    # solo super_admin toca la configuración de empresa
    assert roles.COMPANY_CONFIG_WRITE == (roles.SUPER_ADMIN,)
