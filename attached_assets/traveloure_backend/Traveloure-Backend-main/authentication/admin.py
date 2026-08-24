from django.contrib import admin
from .models import User, LoginHistory, EmailVerificationToken, ServiceProviderForm, LocalExpertForm
# Register your models here.

class UserAdmin(admin.ModelAdmin):
    model = User
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_active', 'created_at','is_staff')
    list_filter = ('is_staff','is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('username','email', 'first_name',)

class ServiceProviderFormAdmin(admin.ModelAdmin):
    list_display = ('business_name', 'name', 'email', 'mobile', 'country', 'status', 'created_at')
    list_filter = ('status', 'country', 'business_type', 'created_at')
    search_fields = ('business_name', 'name', 'email', 'mobile', 'country')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)
    list_editable = ('status',)
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('user', 'business_name', 'name', 'email', 'mobile', 'whatsapp')
        }),
        ('Business Details', {
            'fields': ('website', 'country', 'address', 'booking_link', 'gst', 'business_type')
        }),
        ('Social Media', {
            'fields': ('instagram_link', 'facebook_link', 'linkedin_link'),
            'classes': ('collapse',)
        }),
        ('Documents', {
            'fields': ('photo1', 'photo2', 'photo3', 'photo4', 'photo5', 'business_logo', 'business_license', 'business_gst_tax'),
            'classes': ('collapse',)
        }),
        ('Services & Settings', {
            'fields': ('service_offers', 'description', 'instant_booking', 't_and_c', 'info_confirmation', 'contact_request'),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('status', 'created_at')
        }),
    )

class LocalExpertFormAdmin(admin.ModelAdmin):
    list_display = ('user', 'years_in_city', 'offer_service', 'price_expectation', 'status', 'created_at')
    list_filter = ('status', 'offer_service', 'years_in_city', 'created_at')
    search_fields = ('user__first_name', 'user__last_name', 'user__email')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)
    list_editable = ('status',)
    
    fieldsets = (
        ('User Information', {
            'fields': ('user', 'languages', 'years_in_city', 'offer_service')
        }),
        ('Documents', {
            'fields': ('gov_id', 'travel_licence'),
            'classes': ('collapse',)
        }),
        ('Social Media', {
            'fields': ('instagram_link', 'facebook_link', 'linkedin_link'),
            'classes': ('collapse',)
        }),
        ('Services & Preferences', {
            'fields': ('services', 'service_availability', 'price_expectation'),
            'classes': ('collapse',)
        }),
        ('Terms & Conditions', {
            'fields': ('confirm_age', 't_and_c', 'partnership'),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('status', 'created_at')
        }),
    )

admin.site.register(User, UserAdmin)
admin.site.register(LoginHistory)
admin.site.register(EmailVerificationToken)
admin.site.register(ServiceProviderForm, ServiceProviderFormAdmin)
admin.site.register(LocalExpertForm, LocalExpertFormAdmin)