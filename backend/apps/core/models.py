from django.db import models


class TimeStampedModel(models.Model):
    """Base abstracta con timestamps de creación y actualización."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CompanyProfile(models.Model):
    """Datos de la empresa para el encabezado de documentos (factura PDF, etc.).

    Es un singleton: siempre existe una única fila (pk=1). Editable por admin
    desde Configuración; usado para renderizar el PDF de las facturas.
    """

    name = models.CharField(max_length=150, default="Veragro")
    legal_name = models.CharField(max_length=200, blank=True)
    tax_id = models.CharField("RUC", max_length=50, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    logo = models.ImageField(upload_to="company/", null=True, blank=True)
    invoice_footer = models.TextField(
        blank=True,
        help_text="Texto al pie de la factura (términos, datos de pago, Yappy…).",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Perfil de empresa"
        verbose_name_plural = "Perfil de empresa"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.pk = 1  # fuerza singleton
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
