from django.urls import path
from .views import CreateStripeCheckoutSessionView, stripe_webhook, get_all_plans, CancelSubscriptionView, ActiveSubscriptionView

urlpatterns = [
    path('stripe/checkout/<int:plan_id>/', CreateStripeCheckoutSessionView.as_view(), name='stripe-checkout'),
    path("webhook/stripe/", stripe_webhook, name="stripe-webhook"),
    path("list-plans/", get_all_plans, name="get_all_plans"),
    path("cancel-subscription/", CancelSubscriptionView.as_view(), name="cancel-subscription"),
    path('subscription/active/', ActiveSubscriptionView.as_view(), name='active-subscription'),
]
