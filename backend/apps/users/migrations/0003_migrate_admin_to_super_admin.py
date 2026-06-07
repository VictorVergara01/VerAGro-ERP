from django.db import migrations


def admin_to_super_admin(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(role="admin").update(role="super_admin")


def super_admin_to_admin(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(role="super_admin").update(role="admin")


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_alter_user_role"),
    ]
    operations = [
        migrations.RunPython(admin_to_super_admin, super_admin_to_admin),
    ]
