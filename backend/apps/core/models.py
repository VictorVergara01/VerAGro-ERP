from django.db import models


class TimeStampedModel(models.Model):
    """Base abstracta con timestamps de creación y actualización."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
