from django.contrib import admin
from .models import (
    Wallet, WalletTransaction, APIUsage, AnonymousAPIUsage,
    UserAndExpertContract, ContractTransaction
)

# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# from .models import Plan, Subscription, Payment
# admin.site.register(Plan)
# admin.site.register(Subscription)
# admin.site.register(Payment)

# Contract Models with enhanced admin interface
@admin.register(UserAndExpertContract)
class UserAndExpertContractAdmin(admin.ModelAdmin):
    list_display = ['id', 'contract_title', 'user_name', 'expert_name', 'contract_created_by', 'is_accepted', 'amount', 'is_paid', 'created_at']
    list_filter = ['contract_created_by', 'is_accepted', 'is_paid', 'created_at']
    search_fields = ['contract_title', 'user_id__email', 'expert_id__email', 'trip_to']
    readonly_fields = ['id', 'created_at']
    
    def user_name(self, obj):
        return obj.user_id.email if obj.user_id else 'N/A'
    
    def expert_name(self, obj):
        return obj.expert_id.email if obj.expert_id else 'N/A'
    
    user_name.short_description = 'User Email'
    expert_name.short_description = 'Expert Email'

@admin.register(ContractTransaction)
class ContractTransactionAdmin(admin.ModelAdmin):
    list_display = ['id', 'contract_title', 'user_email', 'expert_email', 'amount', 'transaction_type', 'payment_status', 'is_succeeded', 'created_at']
    list_filter = ['transaction_type', 'payment_status', 'is_succeeded', 'paid_to_expert', 'created_at']
    search_fields = ['transaction_id', 'contract_id__contract_title', 'user_id__email', 'expert_id__email']
    readonly_fields = ['id', 'created_at']
    
    def contract_title(self, obj):
        return obj.contract_id.contract_title if obj.contract_id else 'N/A'
    
    def user_email(self, obj):
        return obj.user_id.email if obj.user_id else 'N/A'
    
    def expert_email(self, obj):
        return obj.expert_id.email if obj.expert_id else 'N/A'
    
    contract_title.short_description = 'Contract Title'
    user_email.short_description = 'User Email'
    expert_email.short_description = 'Expert Email'

# Register wallet models with enhanced admin interface
@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ['user_email', 'balance', 'credits', 'created_at']
    search_fields = ['user__email']
    readonly_fields = ['created_at']
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'N/A'
    
    user_email.short_description = 'User Email'

@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ['user_email', 'transaction_type', 'amount', 'credits', 'created_at']
    list_filter = ['transaction_type', 'created_at']
    search_fields = ['wallet__user__email', 'stripe_payment_intent_id']
    readonly_fields = ['created_at']
    
    def user_email(self, obj):
        return obj.wallet.user.email if obj.wallet and obj.wallet.user else 'N/A'
    
    user_email.short_description = 'User Email'

@admin.register(APIUsage)
class APIUsageAdmin(admin.ModelAdmin):
    list_display = ['user_email', 'api_name', 'cost_per_call', 'created_at']
    list_filter = ['api_name', 'created_at']
    search_fields = ['user__email', 'api_name']
    readonly_fields = ['created_at']
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'N/A'
    
    user_email.short_description = 'User Email'

@admin.register(AnonymousAPIUsage)
class AnonymousAPIUsageAdmin(admin.ModelAdmin):
    list_display = ['ip_address', 'api_name', 'used_at']
    list_filter = ['api_name', 'used_at']
    search_fields = ['ip_address', 'api_name']
    readonly_fields = ['used_at']