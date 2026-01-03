from django.contrib import admin
from .models import AllService

@admin.register(AllService)
class AllServiceAdmin(admin.ModelAdmin):
    list_display = ['id', 'service_provider_email', 'service_name', 'service_type', 'price', 'form_status', 'created_at']
    list_filter = ['service_type', 'form_status', 'created_at']
    search_fields = ['service_name', 'user__email', 'service_type', 'description']
    readonly_fields = ['id', 'created_at']
    
    def service_provider_email(self, obj):
        return obj.user.email if obj.user else 'N/A'
    
    service_provider_email.short_description = 'Service Provider Email'
