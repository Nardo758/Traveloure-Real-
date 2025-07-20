from django.contrib import admin
from .models import Plan, Subscription, Payment

# Register your models here.

admin.site.register(Plan)
admin.site.register(Subscription)
admin.site.register(Payment)