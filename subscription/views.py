import stripe
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from .models import Plan, Subscription, Payment
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from authentication.models import User
from datetime import datetime
from django.utils.timezone import make_aware
from rest_framework.decorators import api_view
from .serializers import PlanSerializer

stripe.api_key = settings.STRIPE_SECRET_KEY

import logging

logger = logging.getLogger(__name__)

class PaymentSuccessView(APIView):
    def get(self, request):
        session_id = request.GET.get('session_id')

        if not session_id:
            return Response({"error": "Session ID is missing"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": "Payment successful", "session_id": session_id}, status=status.HTTP_200_OK)

class CreateStripeCheckoutSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, plan_id):
        plan = get_object_or_404(Plan, id=plan_id, is_active=True)

        if not plan.stripe_price_id:
            return Response({"error": "Invalid Stripe Price ID for the selected plan."}, status=status.HTTP_400_BAD_REQUEST)

        user_email = request.user.email if request.user.is_authenticated else None

        if not user_email:
            return Response({"error": "User email is required for Stripe Checkout."}, status=status.HTTP_400_BAD_REQUEST)

        # Store email in session for later use in webhook processing
        request.session["checkout_email"] = user_email

        try:
            # Create Stripe Checkout Session
            checkout_session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                mode="subscription",
                customer_email=user_email,
                line_items=[{
                    "price": plan.stripe_price_id,  # Ensure this ID is valid
                    "quantity": 1
                }],
                success_url=f"{settings.FRONTEND_URL}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{settings.FRONTEND_URL}/payment-cancel",
                metadata={
                    "user_id": request.user.id,
                    "plan_id": plan.id,
                    "email": user_email
                }
            )

            return Response({"checkout_url": checkout_session.url}, status=status.HTTP_200_OK)

        except stripe.error.InvalidRequestError as e:
            logger.error(f"Stripe Invalid Request: {e}")
            return Response({"error": f"Invalid request: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except stripe.error.StripeError as e:
            logger.error(f"Stripe Error: {e}")
            return Response({"error": f"Stripe error: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected Error: {e}")
            return Response({"error": f"Unexpected error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except ValueError as e:
        print("Error: Invalid payload", e)
        return JsonResponse({"error": "Invalid payload"}, status=400)
    except stripe.error.SignatureVerificationError as e:
        print("Error: Invalid signature", e)
        return JsonResponse({"error": "Invalid signature"}, status=400)

    if event["type"] == "checkout.session.completed":
        print("Checkout Session Completed")

        session = event["data"]["object"]
        user_email = session.get("customer_email")
        stripe_subscription_id = session.get("subscription")
        transaction_id = session.get("id")  # Stripe Checkout Session ID

        if not user_email or not stripe_subscription_id:
            print("Error: Missing user email or subscription ID")
            return JsonResponse({"error": "Missing user email or subscription ID"}, status=400)

        # Fetch line items separately
        try:
            line_items = stripe.checkout.Session.list_line_items(session["id"])
            if not line_items["data"]:
                print("Error: No line items found")
                return JsonResponse({"error": "No line items found"}, status=400)

            price_id = line_items["data"][0]["price"]["id"]
            amount_paid = line_items["data"][0]["amount_total"] / 100  # Convert cents to dollars
        except Exception as e:
            print("Error fetching line items:", e)
            return JsonResponse({"error": "Failed to retrieve line items"}, status=400)

        # Get subscription details from Stripe
        try:
            stripe_subscription = stripe.Subscription.retrieve(stripe_subscription_id)
            current_period_end = stripe_subscription.get("current_period_end")  # UNIX timestamp
            expire_date = make_aware(datetime.fromtimestamp(current_period_end))
        except Exception as e:
            print("Error retrieving subscription details:", e)
            return JsonResponse({"error": "Failed to retrieve subscription details"}, status=400)

        # Find user and plan
        try:
            user = User.objects.get(email=user_email)
            plan = Plan.objects.get(stripe_price_id=price_id)
        except User.DoesNotExist:
            print(f"Error: User with email {user_email} not found")
            return JsonResponse({"error": "User not found"}, status=400)
        except Plan.DoesNotExist:
            print(f"Error: Plan with price ID {price_id} not found")
            return JsonResponse({"error": "Plan not found"}, status=400)

        # Update existing subscription (if any) instead of creating a new one
        existing_subscription = Subscription.objects.filter(user=user, is_active=True).first()

        if existing_subscription:
            existing_subscription.plan = plan
            existing_subscription.stripe_subscription_id = stripe_subscription_id
            existing_subscription.status = "active"
            existing_subscription.expire_date = expire_date
            existing_subscription.is_active = True
            existing_subscription.save()
            subscription_instance = existing_subscription
            print(f"Updated existing subscription for {user.email} to {plan.plan_name}")

        else:
            subscription_instance = Subscription.objects.create(
                user=user,
                plan=plan,
                stripe_subscription_id=stripe_subscription_id,
                status="active",
                expire_date=expire_date,
                is_active=True,
            )
            print(f"Created new subscription for {user.email}")

        # Save payment details
        Payment.objects.create(
            user=user,
            subscription=subscription_instance,
            transaction_id=transaction_id,
            amount_paid=amount_paid,
            payment_status="Completed",
        )
        print(f"Payment record created for {user.email}, Amount: {amount_paid}")

    return JsonResponse({"status": "success"}, status=200)


@api_view(["GET"])
def get_all_plans(request):
    """Retrieve all available subscription plans."""
    plans = Plan.objects.filter(is_active=True)  # Fetch only active plans
    serializer = PlanSerializer(plans, many=True)
    return Response(serializer.data)

class CancelSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # Get user's active subscription
        subscription = Subscription.objects.filter(user=user, is_active=True).first()
        if not subscription:
            return Response({"error": "No active subscription found"}, status=status.HTTP_400_BAD_REQUEST)

        # Find the Free plan
        free_plan = Plan.objects.filter(is_active=True, plan_name="Free").first()
        if not free_plan:
            return Response({"error": "Free plan not found"}, status=status.HTTP_400_BAD_REQUEST)

        # If the user is already on Free Plan, no action needed
        if subscription.plan == free_plan:
            return Response({"message": "You are already on the Free Plan."}, status=status.HTTP_200_OK)

        try:
            # ✅ Ensure subscription ID is valid before calling Stripe
            if subscription.stripe_subscription_id:
                if not isinstance(subscription.stripe_subscription_id, str):
                    return Response(
                        {"error": "Invalid stripe_subscription_id format"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                stripe.Subscription.delete(subscription.stripe_subscription_id)

            # Update existing subscription to Free plan
            subscription.plan = free_plan
            subscription.stripe_subscription_id = None
            subscription.status = "active"
            subscription.is_active = True
            subscription.expire_date = None
            subscription.save()

            return Response(
                {"message": "Subscription canceled. Switched to Free Plan."},
                status=status.HTTP_200_OK
            )

        except stripe.error.StripeError as e:
            return Response({"error": f"Stripe error: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"Unexpected error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ActiveSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        # Get active subscription for the user
        subscription = Subscription.objects.filter(user=user, is_active=True).first()

        if not subscription:
            return Response({"error": "No active subscription found"}, status=status.HTTP_404_NOT_FOUND)

        # Return subscription details
        return Response({
            "plan_name": subscription.plan.plan_name,
            "status": subscription.status,
            "is_active": subscription.is_active,
            "expire_date": subscription.expire_date,
            "stripe_subscription_id": subscription.stripe_subscription_id
        }, status=status.HTTP_200_OK)