from django.db import models
from authentication.models import User
from django.utils.timezone import now, timedelta
import uuid

# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# # Subscription Plans
# class Plan(models.Model):
#     PLAN_CHOICES = [
#         ("Free", "Free"),
#         ("Basic", "Basic"),
#         ("Premium", "Premium"),
#     ]

#     plan_name = models.CharField(max_length=255, choices=PLAN_CHOICES, unique=True)
#     amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)  # Free plan will be 0.00
#     manual_itineraries = models.PositiveIntegerField(default=1)  # Limit itineraries for free plans
#     ai_itineraries = models.PositiveIntegerField(default=0)
#     stripe_product_id = models.CharField(max_length=255, unique=True, blank=True, null=True)
#     stripe_price_id = models.CharField(max_length=255, unique=True, blank=True, null=True)
#     duration_days = models.PositiveIntegerField(null=True, blank=True)  # Allow null for lifetime
#     is_active = models.BooleanField(default=True)

#     def __str__(self):
#         return self.plan_name


# # User Subscriptions
# class Subscription(models.Model):
#     user = models.ForeignKey(User, on_delete=models.CASCADE)
#     plan = models.ForeignKey(Plan, on_delete=models.CASCADE)
#     stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True, blank=True)  # Added field
#     status = models.CharField(max_length=50, default="active")  # Added field (default to active)
#     start_date = models.DateTimeField(auto_now_add=True)
#     expire_date = models.DateTimeField(null=True, blank=True)
#     is_active = models.BooleanField(default=True)

#     def cancel_subscription(self):
#         """Mark subscription as inactive"""
#         self.is_active = False
#         self.status = "canceled"
#         self.save()

#     def __str__(self):
#         return f"{self.user.username} - {self.plan.plan_name} ({self.status})"


# # Payments
# class Payment(models.Model):
#     user = models.ForeignKey(User, on_delete=models.CASCADE)
#     subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, null=True, blank=True)
#     transaction_id = models.CharField(max_length=255, unique=True)
#     payment_date = models.DateTimeField(auto_now_add=True)
#     amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
#     payment_status = models.CharField(
#         max_length=50,
#         choices=[("Pending", "Pending"), ("Completed", "Completed"), ("Failed", "Failed")],
#     )
#     invoice_pdf = models.FileField(upload_to="payments/invoices/", blank=True, null=True)
#     # Correctly set default values
#     created_at = models.DateTimeField(default=now)  
#     updated_at = models.DateTimeField(auto_now=True)

#     def __str__(self):
#         return f"Payment {self.transaction_id} - {self.payment_status}"


# Wallet System for Pay-as-you-go
class Wallet(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)  # Keep for backward compatibility
    credits = models.IntegerField(default=0)  # New credit system
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} - ${self.balance} - {self.credits} credits"

    def add_credits(self, amount_dollars):
        """Add credits based on dollar amount (1$ = 2 credits)"""
        # Convert to float first to handle both Decimal and float inputs
        amount_float = float(amount_dollars)
        credits_to_add = int(amount_float * 2)
        self.credits += credits_to_add
        self.save()
        return credits_to_add

    def deduct_credit(self):
        """Deduct 1 credit for each search"""
        if self.credits >= 1:
            self.credits -= 1
            self.save()
            return True
        return False

    def get_credits(self):
        return self.credits

    def has_sufficient_credits(self):
        return self.credits >= 1

    # Keep old methods for backward compatibility
    def add_balance(self, amount):
        """Add amount to wallet balance"""
        # Convert to Decimal for consistency
        from decimal import Decimal
        if isinstance(amount, float):
            amount = Decimal(str(amount))
        self.balance += amount
        self.save()

    def deduct_balance(self, amount):
        """Deduct amount from wallet balance"""
        if self.balance >= amount:
            self.balance -= amount
            self.save()
            return True
        return False

    def get_balance(self):
        """Get current wallet balance"""
        return self.balance


class WalletTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('RECHARGE', 'Recharge'),
        ('API_USAGE', 'API Usage'),
        ('REFUND', 'Refund'),
        ('CREDIT_RECHARGE', 'Credit Recharge'),
        ('CREDIT_USAGE', 'Credit Usage'),
    ]

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    credits = models.IntegerField(default=0)  # Track credits
    description = models.TextField(blank=True, null=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.wallet.user.email} - {self.transaction_type} - ${self.amount} - {self.credits} credits"


class APIUsage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    api_name = models.CharField(max_length=100)  # e.g., 'itinerary_generation', 'hotel_search'
    cost_per_call = models.DecimalField(max_digits=5, decimal_places=2, default=0.50)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.email} - {self.api_name} - ${self.cost_per_call}"


class AnonymousAPIUsage(models.Model):
    ip_address = models.GenericIPAddressField()
    api_name = models.CharField(max_length=100)
    used_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['ip_address', 'api_name']
    
    def __str__(self):
        return f"{self.ip_address} - {self.api_name} - {self.used_at}"


# --- ENUM CLASS USED IN DJANGO ---
class CreatedBy(models.TextChoices):
    USER = 'user', "User"
    EXPERT = 'expert', "Expert"

# --- OFFER CREATION MODEL BY USER AND EXPERT ---
class UserAndExpertContract(models.Model):
    id = models.UUIDField(primary_key=True, db_index=True, default=uuid.uuid4, editable=False)

    user_id = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contract_user_id_key")
    expert_id = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contract_expert_id_key")

    contract_title = models.CharField(max_length=300)
    trip_to = models.CharField(max_length=100)
    description = models.TextField()
    attachment = models.FileField(upload_to='trip_expert_advice/', null=True)
    contract_created_by = models.CharField(max_length=20, choices=CreatedBy)
    is_accepted = models.BooleanField(default=False)
    amount = models.DecimalField(null=False, max_digits = 20, decimal_places=2)
    is_paid = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


# --- ENUM CLASSES FOR THE TRANSACTION TABLE ---
class PaymentStatus(models.TextChoices):
    REQUIRES_PAYMENT_METHOD = "requires_payment_method", "Requires Payment Method"
    REQUIRES_CONFIRMATION = "requires_confirmation", "Requires Confirmation"
    REQUIRES_ACTION = "requires_action", "Requires Action"
    PROCESSING = "processing", "Processing"
    REQUIRES_CAPTURE = "requires_capture", "Requires Capture"
    CANCELED = "canceled", "Canceled"
    SUCCEEDED = "succeeded", "Succeeded"


class TransactionType(models.TextChoices):
    RECHARGE = "recharge", "Recharge"
    API_USAGE = "api_usage", "API Usage"
    REFUND = "refund", "Refund"
    CREDIT_RECHARGE = "credit_recharge", "Credit Recharge"
    CREDIT_USAGE = "credit_usage", "Credit Usage"
    CONTRACT_TRANSACTION = "contract_transaction", "Contract Transaction"


# --- TRANSACTION TABLE TO RECORD TRANSACTION FOR CONTRACTS ---
class ContractTransaction(models.Model):
    id = models.UUIDField(primary_key=True, null=False, default=uuid.uuid4, db_index=True)

    contract_id = models.ForeignKey(UserAndExpertContract, on_delete=models.CASCADE, related_name="contract_transaction_contract_id_key")
    user_id = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contract_transaction_user_id_key")
    expert_id = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contract_transaction_expert_id_key")

    amount = models.DecimalField(null=False, max_digits = 20, decimal_places=2)
    transaction_id = models.CharField(max_length=150)
    transaction_type = models.CharField(max_length=50, choices=TransactionType)
    payment_status = models.CharField(max_length=60, choices=PaymentStatus)
    is_succeeded = models.BooleanField()
    paid_to_expert = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

