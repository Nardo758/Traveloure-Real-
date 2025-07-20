from django.db import models
from authentication.models import User
from django.utils.timezone import now, timedelta

# Subscription Plans
class Plan(models.Model):
    PLAN_CHOICES = [
        ("Free", "Free"),
        ("Basic", "Basic"),
        ("Premium", "Premium"),
    ]

    plan_name = models.CharField(max_length=255, choices=PLAN_CHOICES, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)  # Free plan will be 0.00
    manual_itineraries = models.PositiveIntegerField(default=1)  # Limit itineraries for free plans
    ai_itineraries = models.PositiveIntegerField(default=0)
    stripe_product_id = models.CharField(max_length=255, unique=True, blank=True, null=True)
    stripe_price_id = models.CharField(max_length=255, unique=True, blank=True, null=True)
    duration_days = models.PositiveIntegerField(null=True, blank=True)  # Allow null for lifetime
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.plan_name


# User Subscriptions
class Subscription(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE)
    stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True, blank=True)  # Added field
    status = models.CharField(max_length=50, default="active")  # Added field (default to active)
    start_date = models.DateTimeField(auto_now_add=True)
    expire_date = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def cancel_subscription(self):
        """Mark subscription as inactive"""
        self.is_active = False
        self.status = "canceled"
        self.save()

    def __str__(self):
        return f"{self.user.username} - {self.plan.plan_name} ({self.status})"


# Payments
class Payment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, null=True, blank=True)
    transaction_id = models.CharField(max_length=255, unique=True)
    payment_date = models.DateTimeField(auto_now_add=True)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(
        max_length=50,
        choices=[("Pending", "Pending"), ("Completed", "Completed"), ("Failed", "Failed")],
    )
    invoice_pdf = models.FileField(upload_to="payments/invoices/", blank=True, null=True)
    # Correctly set default values
    created_at = models.DateTimeField(default=now)  
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment {self.transaction_id} - {self.payment_status}"
