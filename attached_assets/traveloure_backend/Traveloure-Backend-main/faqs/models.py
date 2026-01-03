from django.db import models
import uuid
from authentication.models import get_dynamic_storage

# Create your models here.
class FAQ(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, null=False, blank=False)
    question = models.TextField()
    answer = models.TextField()
    attachment = models.FileField(upload_to='faq_attachments/', blank=True, null=True,storage=get_dynamic_storage(),)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.question