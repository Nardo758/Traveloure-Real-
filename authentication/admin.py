from django.contrib import admin
from .models import User, LoginHistory, EmailVerificationToken
# Register your models here.

class UserAdmin(admin.ModelAdmin):
    model = User
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_active', 'created_at','is_staff')
    list_filter = ('is_staff','is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('username','email', 'first_name',)

admin.site.register(User,UserAdmin)
admin.site.register(LoginHistory)
admin.site.register(EmailVerificationToken)