import stripe
from decimal import Decimal
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.db.models import Q
from .models import Wallet, WalletTransaction, APIUsage, UserAndExpertContract, TransactionType, ContractTransaction, PaymentStatus, CreatedBy
from .travel_token_service import TravelTokenService
# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# from .models import Plan, Subscription, Payment
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from authentication.models import User
from datetime import datetime
from django.utils.timezone import make_aware
from rest_framework.decorators import api_view
from .serializers import WalletSerializer, WalletTransactionSerializer, WalletRechargeSerializer, APIUsageSerializer, UserAndExpertContractSerializer, ContractTransactionSerializer
# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# from .serializers import PlanSerializer

stripe.api_key = settings.STRIPE_SECRET_KEY

import logging

logger = logging.getLogger(__name__)

class PaymentSuccessView(APIView):
    def get(self, request):
        session_id = request.GET.get('session_id')

        if not session_id:
            return Response({"error": "Session ID is missing"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": "Payment successful", "session_id": session_id}, status=status.HTTP_200_OK)

# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# class CreateStripeCheckoutSessionView(APIView):
#     permission_classes = [IsAuthenticated]

#     def post(self, request, plan_id):
#         plan = get_object_or_404(Plan, id=plan_id, is_active=True)

#         if not plan.stripe_price_id:
#             return Response({"error": "Invalid Stripe Price ID for the selected plan."}, status=status.HTTP_400_BAD_REQUEST)

#         user_email = request.user.email if request.user.is_authenticated else None

#         if not user_email:
#             return Response({"error": "User email is required for Stripe Checkout."}, status=status.HTTP_400_BAD_REQUEST)

#         # Store email in session for later use in webhook processing
#         request.session["checkout_email"] = user_email

#         try:
#             # Create Stripe Checkout Session
#             checkout_session = stripe.checkout.Session.create(
#                 payment_method_types=["card"],
#                 mode="subscription",
#                 customer_email=user_email,
#                 line_items=[{
#                     "price": plan.stripe_price_id,  # Ensure this ID is valid
#                     "quantity": 1
#                 }],
#                 success_url=f"{settings.FRONTEND_URL}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
#                 cancel_url=f"{settings.FRONTEND_URL}/payment-cancel",
#                 metadata={
#                     "user_id": request.user.id,
#                     "plan_id": plan.id,
#                     "email": user_email
#                 }
#             )

#             return Response({"checkout_url": checkout_session.url}, status=status.HTTP_200_OK)

#         except stripe.error.InvalidRequestError as e:
#             logger.error(f"Stripe Invalid Request: {e}")
#             return Response({"error": f"Invalid request: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
#         except stripe.error.StripeError as e:
#             logger.error(f"Stripe Error: {e}")
#             return Response({"error": f"Stripe error: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
#         except Exception as e:
#             logger.error(f"Unexpected Error: {e}")
#             return Response({"error": f"Unexpected error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Wallet System Views
class WalletBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get user's wallet balance and credits"""
        wallet, created = Wallet.objects.get_or_create(user=request.user)
        serializer = WalletSerializer(wallet)
        return Response({
            "balance": wallet.balance,
            "credits": wallet.credits,
            "has_sufficient_credits": wallet.has_sufficient_credits(),
            "created_at": wallet.created_at,
            "updated_at": wallet.updated_at
        }, status=status.HTTP_200_OK)


class WalletRechargeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Create Stripe checkout session for wallet recharge"""
        serializer = WalletRechargeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data['amount']
        user_email = request.user.email

        try:
            # Create Stripe Checkout Session for one-time payment
            checkout_session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                mode="payment",  # One-time payment instead of subscription
                customer_email=user_email,
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"Wallet Recharge - ${amount}",
                            "description": f"Recharge wallet with ${amount}",
                        },
                        "unit_amount": int(amount * 100),  # Convert to cents
                    },
                    "quantity": 1,
                }],
                success_url=f"{settings.FRONTEND_URL}/Itinerary?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{settings.FRONTEND_URL}/wallet/cancel",
                metadata={
                    "user_id": request.user.id,
                    "amount": str(amount),
                    "type": "wallet_recharge",
                    "email": user_email
                }
            )

            return Response({"checkout_url": checkout_session.url}, status=status.HTTP_200_OK)

        except stripe.error.StripeError as e:
            logger.error(f"Stripe Error in wallet recharge: {e}")
            return Response({"error": f"Stripe error: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected Error in wallet recharge: {e}")
            return Response({"error": f"Unexpected error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WalletTransactionHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get user's wallet transaction history"""
        wallet, created = Wallet.objects.get_or_create(user=request.user)
        transactions = WalletTransaction.objects.filter(wallet=wallet).order_by('-created_at')
        serializer = WalletTransactionSerializer(transactions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class APIUsageHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get user's API usage history"""
        usage_records = APIUsage.objects.filter(user=request.user).order_by('-created_at')
        serializer = APIUsageSerializer(usage_records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# Utility function for API usage tracking
def track_api_usage(user, api_name, cost_per_call=0.50):
    """
    Track API usage and deduct 1 credit
    Returns: (success, message, remaining_credits, remaining_balance)
    """
    from decimal import Decimal
    
    try:
        wallet, created = Wallet.objects.get_or_create(user=user)
        
        # Debug logging
        logger.info(f"User {user.email} has {wallet.get_credits()} credits and ${wallet.get_balance()} balance")
        
        # Check if user has sufficient credits
        if not wallet.has_sufficient_credits():
            logger.info(f"User {user.email} has insufficient credits: {wallet.get_credits()}")
            return False, "Insufficient credits. Please recharge your wallet.", wallet.get_credits(), float(wallet.get_balance())
        
        # Deduct 1 credit for each API call
        if wallet.deduct_credit():
            # Record the transaction
            WalletTransaction.objects.create(
                wallet=wallet,
                transaction_type='CREDIT_USAGE',
                amount=Decimal('0.50'),  # Keep for backward compatibility
                credits=1,
                description=f"Credit usage: {api_name} (1 credit)"
            )
            
            # Record API usage
            APIUsage.objects.create(
                user=user,
                api_name=api_name,
                cost_per_call=Decimal('0.50')  # Keep for backward compatibility
            )
            
            return True, "API usage tracked successfully", wallet.get_credits(), float(wallet.get_balance())
        else:
            return False, "Failed to deduct credit from wallet", wallet.get_credits(), float(wallet.get_balance())
            
    except Exception as e:
        logger.error(f"Error tracking API usage: {e}")
        return False, "Error tracking API usage", 0, 0.0


# Update the existing webhook to handle wallet recharge
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
        user_email = session.get("customer_email", None)
        transaction_id = session.get("id")
        metadata = session.get("metadata", {})
        payment_type = metadata.get("type")

        if payment_type != TransactionType.CONTRACT_TRANSACTION:
            if not user_email:
                print("Error: Missing user email")
                return JsonResponse({"error": "Missing user email"}, status=400)

            try:
                user = User.objects.get(email=user_email)
            except User.DoesNotExist:
                print(f"Error: User with email {user_email} not found")
                return JsonResponse({"error": "User not found"}, status=400)

        # Handle wallet recharge
        if payment_type == "wallet_recharge":
            amount = float(metadata.get("amount", 0))
            
            if amount > 0:
                wallet, created = Wallet.objects.get_or_create(user=user)
                # Convert float to Decimal for consistency
                amount_decimal = Decimal(str(amount))
                
                # Add credits based on dollar amount (1$ = 2 credits)
                credits_added = wallet.add_credits(amount)
                
                # Record the transaction
                WalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='CREDIT_RECHARGE',
                    amount=amount_decimal,
                    credits=credits_added,
                    description=f"Credit recharge via Stripe: ${amount} = {credits_added} credits",
                    stripe_payment_intent_id=transaction_id
                )
                
                print(f"Credits recharged for {user.email}: ${amount} = {credits_added} credits")
                return JsonResponse({"status": "success"}, status=200)

        # Handle subscription payments (existing logic) - COMMENTED OUT FOR WALLET SYSTEM
        # elif payment_type != "wallet_recharge":
        #     stripe_subscription_id = session.get("subscription")

        #     if not stripe_subscription_id:
        #         print("Error: Missing subscription ID for subscription payment")
        #         return JsonResponse({"error": "Missing subscription ID"}, status=400)

        #     # Fetch line items separately
        #     try:
        #         line_items = stripe.checkout.Session.list_line_items(session["id"])
        #         if not line_items["data"]:
        #             print("Error: No line items found")
        #             return JsonResponse({"error": "No line items found"}, status=400)

        #         price_id = line_items["data"][0]["price"]["id"]
        #         amount_paid = line_items["data"][0]["amount_total"] / 100  # Convert cents to dollars
        #     except Exception as e:
        #         print("Error fetching line items:", e)
        #         return JsonResponse({"error": "Failed to retrieve line items"}, status=400)

        #     # Get subscription details from Stripe
        #     try:
        #         stripe_subscription = stripe.Subscription.retrieve(stripe_subscription_id)
        #         current_period_end = stripe_subscription.get("current_period_end")  # UNIX timestamp
        #         expire_date = make_aware(datetime.fromtimestamp(current_period_end))
        #     except Exception as e:
        #         print("Error retrieving subscription details:", e)
        #         return JsonResponse({"error": "Failed to retrieve subscription details"}, status=400)

        #     # Find plan
        #     try:
        #         plan = Plan.objects.get(stripe_price_id=price_id)
        #     except Plan.DoesNotExist:
        #         print(f"Error: Plan with price ID {price_id} not found")
        #         return JsonResponse({"error": "Plan not found"}, status=400)

        #     # Update existing subscription (if any) instead of creating a new one
        #     existing_subscription = Subscription.objects.filter(user=user, is_active=True).first()

        #     if existing_subscription:
        #         existing_subscription.plan = plan
        #         existing_subscription.stripe_subscription_id = stripe_subscription_id
        #         existing_subscription.status = "active"
        #         existing_subscription.expire_date = expire_date
        #         existing_subscription.is_active = True
        #         existing_subscription.save()
        #         subscription_instance = existing_subscription
        #         print(f"Updated existing subscription for {user.email} to {plan.plan_name}")

        #     else:
        #         subscription_instance = Subscription.objects.create(
        #         user=user,
        #         plan=plan,
        #         stripe_subscription_id=stripe_subscription_id,
        #         status="active",
        #         expire_date=expire_date,
        #         is_active=True,
        #     )
        #         print(f"Created new subscription for {user.email}")

        #     # Save payment details
        #     Payment.objects.create(
        #         user=user,
        #         subscription=subscription_instance,
        #         transaction_id=transaction_id,
        #         amount_paid=amount_paid,
        #         payment_status="Completed",
        #     )
        #         print(f"Payment record created for {user.email}, Amount: {amount_paid}")

        if payment_type == TransactionType.CONTRACT_TRANSACTION:
            contract_instance = UserAndExpertContract.objects.filter(
                id=metadata.get("contract_id")
            ).first()

            if not contract_instance:
                # handle the case where the contract doesn't exist
                print(f"Contract with id {metadata.get('contract_id')} not found.")
                return
            
            # Only mark as paid if payment actually succeeded
            payment_succeeded = (event["data"].get("payment_status") == "paid" and 
                               event["data"].get("status") == "complete")
            
            if payment_succeeded:
                contract_instance.is_paid = True
                contract_instance.save()
                print(f"Contract {contract_instance.id} marked as PAID - Payment succeeded")
            else:
                print(f"Contract {contract_instance.id} NOT marked as paid - Payment status: {event['data'].get('payment_status')}, Status: {event['data'].get('status')}")
        
            ContractTransaction.objects.create(
                contract_id = contract_instance,
                user_id = User.objects.filter(id = metadata.get("user_id")).first(),
                expert_id = User.objects.filter(id = metadata.get("expert_id")).first(),
                transaction_id = transaction_id,
                transaction_type = TransactionType.CONTRACT_TRANSACTION,
                payment_status = PaymentStatus.SUCCEEDED if event["data"].get("payment_status") == "paid" and event["data"].get("status") == "complete" else PaymentStatus.REQUIRES_CONFIRMATION,
                is_succeeded = True if event["data"].get("payment_status") == "paid" and event["data"].get("status") == "complete" else False,
                paid_to_expert = False,
                amount = session.get("amount_total") / 100
            )

    return JsonResponse({"status": "success"}, status=200)


# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# @api_view(["GET"])
# def get_all_plans(request):
#     """Retrieve all available subscription plans."""
#     plans = Plan.objects.filter(is_active=True)  # Fetch only active plans
#     serializer = PlanSerializer(plans, many=True)
#     return Response(serializer.data)

# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# class CancelSubscriptionView(APIView):
#     permission_classes = [IsAuthenticated]

#     def post(self, request):
#         user = request.user

#         # Get user's active subscription
#         subscription = Subscription.objects.filter(user=user, is_active=True).first()
#         if not subscription:
#             return Response({"error": "No active subscription found"}, status=status.HTTP_400_BAD_REQUEST)

#         # Find the Free plan
#         free_plan = Plan.objects.filter(is_active=True, plan_name="Free").first()
#         if not free_plan:
#             return Response({"error": "Free plan not found"}, status=status.HTTP_400_BAD_REQUEST)

#         # If the user is already on Free Plan, no action needed
#         if subscription.plan == free_plan:
#             return Response({"message": "You are already on the Free Plan."}, status=status.HTTP_200_OK)

#         try:
#             # ✅ Ensure subscription ID is valid before calling Stripe
#             if subscription.stripe_subscription_id:
#                 if not isinstance(subscription.stripe_subscription_id, str):
#                     return Response(
#                         {"error": "Invalid stripe_subscription_id format"},
#                         status=status.HTTP_400_BAD_REQUEST
#                     )
                
#                 stripe.Subscription.delete(subscription.stripe_subscription_id)

#             # Update existing subscription to Free plan
#             subscription.plan = free_plan
#             subscription.stripe_subscription_id = None
#             subscription.status = "active"
#             subscription.is_active = True
#             subscription.expire_date = None
#             subscription.save()

#             return Response(
#                 {"message": "Subscription canceled. Switched to Free Plan."},
#                 status=status.HTTP_200_OK
#             )

#         except stripe.error.StripeError as e:
#             return Response({"error": f"Stripe error: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
#         except Exception as e:
#             return Response({"error": f"Unexpected error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# class ActiveSubscriptionView(APIView):
#     permission_classes = [IsAuthenticated]

#     def get(self, request):
#         user = request.user

#         # Get active subscription for the user
#         subscription = Subscription.objects.filter(user=user, is_active=True).first()

#         if not subscription:
#             return Response({"error": "No active subscription found"}, status=status.HTTP_404_NOT_FOUND)

#         # Return subscription details
#         return Response({
#             "plan_name": subscription.plan.plan_name,
#             "status": subscription.status,
#             "is_active": subscription.is_active,
#             "expire_date": subscription.expire_date,
#             "stripe_subscription_id": subscription.stripe_subscription_id
#         }, status=status.HTTP_200_OK)



class UserAndExpertContractApi(APIView):
    permission_classes = [IsAuthenticated]
    

    def post(self, request):
        serializer = UserAndExpertContractSerializer(data = request.data, context = {"request": request})

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def get(self, request, id_created_for = None):
        logged_in_user = request.user

        if id_created_for is not None:
            target_user = User.objects.get(id = id_created_for)

            if target_user.is_local_expert == logged_in_user.is_local_expert:
                return Response(
                    {"error": "Both users cannot have the same role (both expert or both user)."}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            if logged_in_user.is_local_expert:
                contracts = UserAndExpertContract.objects.filter(expert_id = logged_in_user.id, user_id = id_created_for)
            elif logged_in_user.is_local_expert == False and logged_in_user.is_service_provider == False:
                contracts = UserAndExpertContract.objects.filter(user_id = logged_in_user.id, expert_id = id_created_for)   
            else:
                return Response(
                    {"error": "Invalid role for logged-in user"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not contracts:
                return Response(
                    {"error": "Contract not found"}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = UserAndExpertContractSerializer(contracts, many=True)
            return Response(
                serializer.data, 
                status=status.HTTP_200_OK
            ) 


        if logged_in_user.is_local_expert:
            contracts = UserAndExpertContract.objects.filter(expert_id = logged_in_user.id)

        elif logged_in_user.is_local_expert == False and logged_in_user.is_service_provider == False:
            contracts = UserAndExpertContract.objects.filter(user_id = logged_in_user.id) 

        else:
            return Response(
                {"error": "Invalid role for logged-in user"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not contracts:
            return Response(
                {"error": "Contract not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = UserAndExpertContractSerializer(contracts, many=True)
        return Response(
            serializer.data, 
            status=status.HTTP_200_OK
        ) 
            

    def patch(self, request):
        expert_id = None
        user_id = None
        logged_in_user = request.user
        id_created_for = request.data.get("id_created_for")
        is_accepted = request.data.get("is_accepted")
        amount = request.data.get("amount")
        contract_id = request.data.get("contract_id")  # Add contract_id parameter

        if id_created_for is None or is_accepted is None:
            return Response(
                {"error": "id_created_for and is_accepted are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate target user exists
        try:
            target_user = User.objects.get(id=id_created_for)
        except User.DoesNotExist:
            return Response(
                {"error": "Target user not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # ACCEPT/REJECT: Only the person for whom contract is created can accept/reject
        if is_accepted is True:
            print(f"DEBUG: Logged in user: {logged_in_user.id}")
            print(f"DEBUG: id_created_for: {id_created_for}")
            print(f"DEBUG: contract_id: {contract_id}")
            
            # Find the specific contract by ID if provided, otherwise use the old logic
            if contract_id:
                try:
                    contract = UserAndExpertContract.objects.get(
                        id=contract_id,
                        # Ensure the contract involves both parties
                        **({
                            "expert_id": logged_in_user.id, 
                            "user_id": id_created_for
                        } if logged_in_user.id != id_created_for else {
                            "user_id": logged_in_user.id, 
                            "expert_id": id_created_for
                        })
                    )
                except UserAndExpertContract.DoesNotExist:
                    return Response(
                        {"error": f"Contract with ID {contract_id} not found between users {logged_in_user.id} and {id_created_for}"},
                        status=status.HTTP_404_NOT_FOUND
                    )
            else:
                # Fallback to old logic - find the contract by parties involved
                contract = UserAndExpertContract.objects.filter(
                    Q(expert_id=logged_in_user.id, user_id=id_created_for) |
                    Q(user_id=logged_in_user.id, expert_id=id_created_for)
                ).first()
            
            # Debug: Check all contracts for this user
            all_contracts = UserAndExpertContract.objects.filter(
                Q(expert_id=logged_in_user.id) | Q(user_id=logged_in_user.id)
            )
            print(f"DEBUG: All contracts for user {logged_in_user.id}: {[str(c.id) for c in all_contracts]}")
            
            if not contract:
                return Response(
                    {"error": f"Contract not found between users {logged_in_user.id} and {id_created_for}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            print(f"DEBUG: Contract created by: {contract.contract_created_by}")
            print(f"DEBUG: Contract expert_id: {contract.expert_id} (ID: {contract.expert_id.id})")
            print(f"DEBUG: Contract user_id: {contract.user_id} (ID: {contract.user_id.id})")
            print(f"DEBUG: Logged in user: {logged_in_user.id}")
            
            # Check if logged-in user is the one for whom contract was created
            if contract.contract_created_by == CreatedBy.USER:
                # User created for expert, so EXPERT should accept
                print(f"DEBUG: User created contract. Expert should accept.")
                print(f"DEBUG: Expected expert ID: {contract.expert_id.id}")
                print(f"DEBUG: Logged in user ID: {logged_in_user.id}")
                if contract.expert_id.id != logged_in_user.id:
                    return Response(
                        {"error": f"Only the assigned expert can accept this contract. Expected: {contract.expert_id.id}, Got: {logged_in_user.id}"},
                        status=status.HTTP_403_FORBIDDEN
                    )
                expert_id = logged_in_user.id
                user_id = id_created_for
                
            elif contract.contract_created_by == CreatedBy.EXPERT:
                # Expert created for user, so USER should accept
                print(f"DEBUG: Expert created contract. User should accept.")
                print(f"DEBUG: Expected user ID: {contract.user_id.id}")
                print(f"DEBUG: Logged in user ID: {logged_in_user.id}")
                if contract.user_id.id != logged_in_user.id:
                    return Response(
                        {"error": f"Only the assigned traveler can accept this contract. Expected: {contract.user_id.id}, Got: {logged_in_user.id}"},
                        status=status.HTTP_403_FORBIDDEN
                    )
                user_id = logged_in_user.id
                expert_id = id_created_for
            else:
                return Response(
                    {"error": "Invalid contract creator"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # PRICE UPDATE: Both user and expert can update amount
        else:
            if logged_in_user.is_local_expert:
                expert_id = logged_in_user.id
                user_id = id_created_for
                contract = UserAndExpertContract.objects.filter(
                    expert_id=expert_id,
                    user_id=user_id
                ).first()

            elif logged_in_user.is_local_expert == False and logged_in_user.is_service_provider == False:
                user_id = logged_in_user.id
                expert_id = id_created_for
                contract = UserAndExpertContract.objects.filter(
                    user_id=user_id,
                    expert_id=expert_id
                ).first()
        
        if not contract:
            return Response(
                {"error": "Contract not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )

        if contract.is_paid:
            return Response(
                {"error": "Payment is already done for this contract."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        if is_accepted is True:
            if amount is not None:
                return Response(
                    {"error": "Amount must be null when is_accepted is true"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            serializer = UserAndExpertContractSerializer(
                instance = contract, 
                data={"is_accepted": True},
                partial=True,
                context={"request": request},
            )

            if serializer.is_valid():
                serializer.save()
                
                session = stripe.checkout.Session.create(
                    payment_method_types = ["card"],
                    line_items = [
                        {
                            "price_data": {
                                "currency": "usd",
                                "product_data": {"name": f"Contract Payment - {contract.id}"},
                                "unit_amount": int(contract.amount * 100),
                            },
                            "quantity": 1,
                        }
                    ],
                    mode = "payment",
                    success_url = "http://127.0.0.1:8000/payment-success",
                    cancel_url = "http://127.0.0.1:8000/payment-cancel",
                    metadata = {
                        "contract_id": str(contract.id),
                        "user_id": str(user_id),
                        "expert_id": str(expert_id),
                        "accepted": "true",
                        "type": TransactionType.CONTRACT_TRANSACTION,
                    }
                )

                return Response(
                    {
                        "message": "Contract accepted. Payment link generated.",
                        "contract": serializer.data,
                        "payment_url": session.url,
                    },
                    status=status.HTTP_200_OK,
                )
            
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        else:
            if amount is None:
                return Response(
                    {"error": "Price is required when is_accepted is false"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            serializer = UserAndExpertContractSerializer(
                contract,
                data={"is_accepted": False, "amount": amount},
                partial=True,
                context={"request": request},
            )
            if serializer.is_valid():
                serializer.save()
                return Response(
                    {
                        "message": "Contract updated with new amount",
                        "contract": serializer.data,
                    },
                    status=status.HTTP_200_OK,
                )

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    def delete(self, request, contract_id):
        logged_in_user = request.user
        
        # Check if user is authenticated
        if not logged_in_user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            contract = UserAndExpertContract.objects.get(id=contract_id)
        except UserAndExpertContract.DoesNotExist:
            return Response(
                {"error": "Contract not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if contract is already paid
        if contract.is_paid:
            return Response(
                {"error": "Paid contracts cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Only creator can delete
        if (logged_in_user.is_local_expert and 
            contract.contract_created_by == CreatedBy.EXPERT and 
            contract.expert_id == logged_in_user):
            contract.delete()
            
        elif (not logged_in_user.is_local_expert and 
              not logged_in_user.is_service_provider and 
              contract.contract_created_by == CreatedBy.USER and 
              contract.user_id == logged_in_user):
            contract.delete()
            
        else:
            return Response(
                {"error": "Only the creator can delete this contract."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return Response(
            {
                "message": "Contract deleted succesfully"
            },
            status = status.HTTP_200_OK
        )

class ContractDeleteApi(APIView):
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, contract_id):
        logged_in_user = request.user
        
        try:
            contract = UserAndExpertContract.objects.get(id=contract_id)
        except UserAndExpertContract.DoesNotExist:
            return Response(
                {"error": "Contract not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if contract is already paid
        if contract.is_paid:
            return Response(
                {"error": "Paid contracts cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Only creator can delete
        if (logged_in_user.is_local_expert and 
            contract.contract_created_by == CreatedBy.EXPERT and 
            contract.expert_id == logged_in_user):
            contract.delete()
            
        elif (not logged_in_user.is_local_expert and 
              not logged_in_user.is_service_provider and 
              contract.contract_created_by == CreatedBy.USER and 
              contract.user_id == logged_in_user):
            contract.delete()
            
        else:
            return Response(
                {"error": "Only the creator can delete this contract."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return Response(
            {"message": "Contract deleted successfully"},
            status=status.HTTP_200_OK
        )

class ContractTransactionApi(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, contract_id = None):
        logged_in_user = request.user

        if contract_id is not None:
            contract_transaction = ContractTransaction.objects.filter(contract_id = contract_id)
            
        else:
            if logged_in_user.is_local_expert:
                contract_transaction = ContractTransaction.objects.filter(expert_id = logged_in_user.id)

            elif logged_in_user.is_local_expert == False and logged_in_user.is_service_provider == False:
                contract_transaction = ContractTransaction.objects.filter(user_id = logged_in_user.id)

            else:
                return Response(
                    {
                        "error": "No transaction history for this user type unknwon user type"
                    },
                    status = status.HTTP_400_BAD_REQUEST
                )
        
        if not contract_transaction:
            return Response(
                {
                    "message": "contract transaction not found for this user"
                },
                status = status.HTTP_200_OK
            )
        
        serializer = ContractTransactionSerializer(contract_transaction, many=True, context={"request": request})
        return Response(
            serializer.data,
            status = status.HTTP_200_OK
        )


class TravelTokenApi(APIView):
    """
    Travel Token API for Access.com integration
    """
    permission_classes = [AllowAny]  # Allow both authenticated and anonymous users
    
    def post(self, request):
        """
        Create a travel session token using Access.com API
        
        Required fields:
        - member_key: Unique identifier for the user
        
        Optional fields:
        - email: User's email address
        - first_name: User's first name  
        - last_name: User's last name
        - scope: Token scope (default: 'travel')
        """
        
        # Get data from request
        member_key = request.data.get('member_key')
        email = request.data.get('email')
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        scope = request.data.get('scope', 'travel')  # Default scope is 'travel'
        
        # Validate required fields
        if not member_key:
            return Response({
                "error": "member_key is required",
                "required_fields": ["member_key"],
                "optional_fields": ["email", "first_name", "last_name", "scope"]
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # If user is authenticated, use their details as defaults
        if request.user.is_authenticated:
            if not email:
                email = request.user.email
            if not first_name:
                first_name = request.user.first_name
            if not last_name:
                last_name = request.user.last_name
        
        # Create travel token service instance
        travel_service = TravelTokenService()
        
        # Create session token
        result = travel_service.create_session_token(
            member_key=member_key,
            email=email,
            first_name=first_name,
            last_name=last_name,
            scope=scope
        )
        
        if result.get("success"):
            return Response({
                "status": "success",
                "message": "Travel session token created successfully",
                "data": {
                    "session_token": result.get("session_token"),
                    "member_key": result.get("member_key"),
                    "scope": result.get("scope"),
                    "email": email,
                    "first_name": first_name,
                    "last_name": last_name
                }
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                "status": "error",
                "message": "Failed to create travel session token",
                "error": result.get("error"),
                "status_code": result.get("status_code"),
                "debug_info": {
                    "api_url": "https://auth.adcrws.com/api/v1/tokens",
                    "api_key_used": "12968385107f16fa2bc5",
                    "member_key": member_key,
                    "scope": scope,
                    "response_data": result.get("response_data")
                }
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def get(self, request):
        """
        Get information about Travel Token API usage
        """
        return Response({
            "status": "success",
            "message": "Travel Token API for Access.com integration",
            "api_info": {
                "endpoint": "/plan/travel-token/",
                "method": "POST",
                "description": "Create travel session token for Access.com platform",
                "required_fields": ["member_key"],
                "optional_fields": ["email", "first_name", "last_name", "scope"],
                "default_scope": "travel",
                "example_payload": {
                    "member_key": "your_member_key",
                    "email": "Leon@Traveloure.com",
                    "first_name": "Leon",
                    "last_name": "Dixon",
                    "scope": "travel"
                }
            }
        }, status=status.HTTP_200_OK)