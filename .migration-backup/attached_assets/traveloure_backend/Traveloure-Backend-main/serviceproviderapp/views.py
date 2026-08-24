from rest_framework import generics, status,filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import AllService
from .serializers import AllServiceSerializer,ServiceStatusUpdateSerializer, ServiceDashboardSerializer
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from .permissions import ServiceCreatePermission
from rest_framework.response import Response
from django.db.models import Q
from subscription.models import ServiceTransaction


class AllServiceListCreateView(generics.ListCreateAPIView):
    serializer_class = AllServiceSerializer
    permission_classes = [IsAuthenticated, ServiceCreatePermission]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['form_status', 'service_type', 'location']  # Filtering
    search_fields = ['service_name', 'description', 'location']    # Searching
    ordering = ['-created_at']          # Default ordering

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser and user.is_staff:
            return AllService.objects.all().order_by('-created_at')
        return AllService.objects.filter(user=user).order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        # Remove Stripe requirements for now - allow service creation without Stripe
        # if not user.stripe_account_id:
        #     return Response(
        #         {"error": "User must have a Stripe account to create a service"},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )
        # if not user.stripe_onboarding_complete:
        #     return Response(
        #         {"error": "User's Stripe account onboarding must be complete to create a service"},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )
        serializer.save(user=user)

class AllServiceRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    queryset = AllService.objects.all()
    serializer_class = AllServiceSerializer
    permission_classes = [IsAuthenticated, ServiceCreatePermission]
    lookup_field = 'id'


class ServiceStatusUpdateView(generics.GenericAPIView):
    serializer_class = ServiceStatusUpdateSerializer
    permission_classes = [IsAdminUser]

    def post(self, request, *args, **kwargs):
        service_id = request.data.get('id')
        form_status = request.data.get('form_status')

        if not service_id or not form_status:
            return Response(
                {"detail": "Both 'id' and 'form_status' are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            service = AllService.objects.get(id=service_id)
        except AllService.DoesNotExist:
            return Response(
                {"detail": "Service not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(service, data={'form_status': form_status}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data, status=status.HTTP_200_OK)


class AllAvailableServiceView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = AllServiceSerializer
    
    def get_queryset(self):
        # Only show approved services from service providers
        queryset = AllService.objects.filter(
            form_status='approved',
            user__is_service_provider=True
        ).order_by('-created_at')

        search_query = self.request.query_params.get('search', None)
        location = self.request.query_params.get('location', None)

        if search_query:
            queryset = queryset.filter(service_name__icontains=search_query)
        if location:
            queryset = queryset.filter(
                Q(location__icontains=location) |
                Q(user__country__icontains=location) | 
                Q(user__city__icontains=location)
            )

        return queryset


import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY  # Ensure STRIPE_SECRET_KEY is set in settings.py

class PayForServiceView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]

    def create(self, request, service_id, *args, **kwargs):
        python# views.py (PayForServiceView logic)

import stripe
from rest_framework import status
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.conf import settings
from .models import AllService, User

stripe.api_key = settings.STRIPE_SECRET_KEY

class PayForServiceView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]

    def create(self, request, service_id, *args, **kwargs):
        try:
            service = AllService.objects.get(id=service_id)
        except AllService.DoesNotExist:
            return Response({"error": "Service not found"}, status=status.HTTP_404_NOT_FOUND)

        seller = service.user
        # Temporarily disable Stripe requirements for testing
        # if not seller.stripe_account_id:
        #     return Response({"error": "Seller has no Stripe account"}, status=status.HTTP_400_BAD_REQUEST)
        
        # if not seller.stripe_onboarding_complete:
        #     return Response({"error": "Seller's Stripe account is not fully onboarded"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = float(service.price)
        except ValueError:
            return Response({"error": "Invalid service price"}, status=status.HTTP_400_BAD_REQUEST)

        platform_fee_percent = float(settings.PLATFORM_FEE_PERCENT)
        platform_fee = amount * platform_fee_percent
        total_amount = amount + platform_fee
        amount_in_cents = int(total_amount * 100)
        platform_fee_in_cents = int(platform_fee * 100)

        try:
            # Create checkout session data
            checkout_data = {
                'payment_method_types': ['card'],
                'line_items': [
                    {
                        'price_data': {
                            'currency': 'usd',
                            'product_data': {
                                'name': service.service_name,
                            },
                            'unit_amount': amount_in_cents,  # Total amount (service + fee)
                        },
                        'quantity': 1,
                    },
                ],
                'mode': 'payment',
                'success_url': settings.STRIPE_SUCCESS_URL,
                'cancel_url': settings.STRIPE_FAILED_URL,
                'metadata': {
                    'service_id': str(service.id),
                    'buyer_id': str(request.user.id),
                    'seller_id': str(seller.id),
                    'payment_type': 'service_payment',
                    'service_amount': str(amount),
                    'platform_fee': str(platform_fee),
                },
                'customer_email': request.user.email,
            }
            
            # Only add transfer data if seller has Stripe account
            if seller.stripe_account_id:
                checkout_data['payment_intent_data'] = {
                    'transfer_data': {
                        'destination': seller.stripe_account_id,  # Transfer to seller's account
                    },
                    'application_fee_amount': platform_fee_in_cents,  # Platform retains 25% fee
                }
            
            checkout_session = stripe.checkout.Session.create(**checkout_data)
        except stripe.error.StripeError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"checkout_url": checkout_session.url}, status=status.HTTP_200_OK)


class ServiceDashboardView(generics.GenericAPIView):
    """
    Service Dashboard API for service providers
    Returns dashboard data including earnings, service counts, ratings, etc.
    Supports filtering by search parameters for active services.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ServiceDashboardSerializer

    def get(self, request, *args, **kwargs):
        user = request.user
        
        # Get user's services
        user_services = AllService.objects.filter(user=user)
        
        # Calculate active services count (approved services)
        active_services_count = user_services.filter(form_status='approved').count()
        
        # Get services list (all services created by current user)
        services_list = user_services.order_by('-created_at')
        
        # Apply filtering if search parameters are provided
        search_query = request.query_params.get('search', None)
        service_type = request.query_params.get('service_type', None)
        form_status = request.query_params.get('form_status', None)
        location = request.query_params.get('location', None)
        
        if search_query:
            services_list = services_list.filter(
                Q(service_name__icontains=search_query) |
                Q(description__icontains=search_query)
            )
        
        if service_type:
            services_list = services_list.filter(service_type__icontains=service_type)
            
        if form_status:
            services_list = services_list.filter(form_status=form_status)
            
        if location:
            services_list = services_list.filter(location__icontains=location)
        
        # If no specific filters are applied, show all services
        # If filters are applied, only show filtered results
        if not any([search_query, service_type, form_status, location]):
            # No filters applied - show all services
            filtered_services = services_list
        else:
            # Filters applied - show only filtered active services
            filtered_services = services_list.filter(form_status='approved')
        
        # Since payment system is not available yet, return zeros for these fields
        total_earnings = 0.00
        services_booked_count = 0
        average_rating = 0.00
        
        # Since booking system is not available yet, return empty lists
        bookings_list = []
        feedback_list = []
        
        # Prepare dashboard data
        dashboard_data = {
            'total_earnings': total_earnings,
            'active_services_count': active_services_count,
            'services_booked_count': services_booked_count,
            'average_rating': average_rating,
            'services_list': AllServiceSerializer(filtered_services, many=True).data,
            'bookings_list': bookings_list,
            'feedback_list': feedback_list
        }
        
        serializer = self.get_serializer(dashboard_data)
        return Response(serializer.data, status=status.HTTP_200_OK)
