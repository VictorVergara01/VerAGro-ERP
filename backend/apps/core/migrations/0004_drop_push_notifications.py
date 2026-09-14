"""Limpia lo que dejó la app `notifications` (push a la app móvil), ya retirada.

Sin la app en INSTALLED_APPS su tabla quedaría huérfana en las bases existentes,
con los tokens de push de los teléfonos. Se borran la tabla, su historial de
migraciones y su content type (sus permisos caen en cascada). En una base nueva
nada de eso existe y la migración no hace nada. El reverso no restaura nada.
"""
from django.db import migrations


def remove_contenttypes(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    ContentType.objects.filter(app_label="notifications").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_alter_companyprofile_drone_tank_volume_liters"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunSQL(
            [
                "DROP TABLE IF EXISTS notifications_pushdevice",
                "DELETE FROM django_migrations WHERE app = 'notifications'",
            ],
            migrations.RunSQL.noop,
        ),
        migrations.RunPython(remove_contenttypes, migrations.RunPython.noop),
    ]
