from django.db import models
from authentication.models import User, get_dynamic_storage
import uuid

# Create your models here.


class AllService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    service_file = models.FileField(upload_to="serviceprovider/services/",storage=get_dynamic_storage(), null=True, blank=True)
    service_name = models.CharField(max_length=255, null=True, blank=True)
    service_type = models.CharField(max_length=255, null=True, blank=True)
    price = models.CharField(max_length=50, null=True, blank=True)
    price_based_on = models.CharField(max_length=100, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    location = models.CharField(max_length=255, default="India", help_text="Service location (city, area, etc.)")
    availability = models.JSONField(default=list, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    form_status = models.CharField(max_length=50, default='pending', null=True, blank=True)