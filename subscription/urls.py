from django.urls import path
from .views import (
    # OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
    # CreateStripeCheckoutSessionView, get_all_plans, 
    # CancelSubscriptionView, ActiveSubscriptionView,
    stripe_webhook,
    WalletBalanceView, WalletRechargeView, WalletTransactionHistoryView, APIUsageHistoryView, 
    UserAndExpertContractApi, ContractDeleteApi, ContractTransactionApi, TravelTokenApi
)

urlpatterns = [
    # OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
    # path('stripe/checkout/<int:plan_id>/', CreateStripeCheckoutSessionView.as_view(), name='stripe-checkout'),
    # path("list-plans/", get_all_plans, name="get_all_plans"),
    # path("cancel-subscription/", CancelSubscriptionView.as_view(), name="cancel-subscription"),
    # path('subscription/active/', ActiveSubscriptionView.as_view(), name='active-subscription'),
    
    # Keep webhook for wallet recharge
    path("webhook/stripe/", stripe_webhook, name="stripe-webhook"),
    
    # Wallet URLs - PAY-AS-YOU-GO SYSTEM
    path('wallet/balance/', WalletBalanceView.as_view(), name='wallet-balance'),
    path('wallet/recharge/', WalletRechargeView.as_view(), name='wallet-recharge'),
    path('wallet/transactions/', WalletTransactionHistoryView.as_view(), name='wallet-transactions'),
    path('wallet/api-usage/', APIUsageHistoryView.as_view(), name='api-usage-history'),

    # --- CONTRACTS BY USER AND EXPERT ---
    path("contracts/", UserAndExpertContractApi.as_view(), name='contract-create-get-api'), # POST/GET/PATCH both method allowed on this url
    path("contracts/<uuid:id_created_for>/", UserAndExpertContractApi.as_view(), name='get-particular-user-expert-contract'),
    path("contracts/delete/<uuid:contract_id>/", ContractDeleteApi.as_view(), name='delete-particular-contract'),
    
    # --- FETCHING TRANSACTION OF CONTRACTS BY USER AND EXPERT ---
    path("contract-transactions/", ContractTransactionApi.as_view(), name='get-all-contract-transactions'),
    path("contract-transactions/<uuid:contract_id>/", ContractTransactionApi.as_view(), name='get-particular-contract-transaction'),
    
    # --- TRAVEL TOKEN API FOR ACCESS.COM INTEGRATION ---
    path("travel-token/", TravelTokenApi.as_view(), name='travel-token-api'),
]
