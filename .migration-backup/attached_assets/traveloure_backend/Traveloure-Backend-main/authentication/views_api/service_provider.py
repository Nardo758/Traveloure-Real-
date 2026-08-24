from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, filters, status
from rest_framework.permissions import  IsAuthenticated, IsAdminUser
from authentication.models import *
from authentication.serializers import *
from collections import defaultdict
import logging
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from serviceproviderapp.models import AllService
from serviceproviderapp.serializers import AllServiceSerializer

logger = logging.getLogger('travelDNA')


class CreateServiceProviderFormView(generics.CreateAPIView):
    serializer_class = ServiceProviderCreateFormSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        user = request.user
        try:
            form = ServiceProviderForm.objects.get(user=user)
            if form.status == 'pending':
                return Response(
                    {"detail": "Your application is already under review."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif form.status == 'approved':
                return Response(
                    {"detail": "You have already been approved as a Service Provider."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif form.status == 'rejected':
                # Update existing form with new data and reset status
                serializer = self.get_serializer(form, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save(status='pending')
                return Response(
                    {"detail": "Your rejected application has been updated and resubmitted."},
                    status=status.HTTP_200_OK
                )

        except ServiceProviderForm.DoesNotExist:
            # Create new form
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(user=user, status='pending')
            return Response(
                {"detail": "Application submitted successfully."},
                status=status.HTTP_201_CREATED
            )

class RetrieveServiceProviderStatus(generics.ListAPIView):
    serializer_class = ServiceProviderFormSerializer
    permission_classes = [IsAuthenticated]
    queryset = ServiceProviderForm.objects.all()
    

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().filter(user=request.user).first()
        if not queryset:
            return Response({'message':"Not Found","status":False},status=404)
        serializer = self.get_serializer(instance = queryset)
        return Response({'message':'Fetched Successfully','data':serializer.data,'status':True},status=200)
    
class ManageServiceProviderFormListView(generics.ListAPIView):
    serializer_class = ServiceProviderFormSerializer
    permission_classes = [IsAdminUser]
    queryset = ServiceProviderForm.objects.all().order_by('-created_at')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['status']
    search_fields = ['business_name', 'email', 'mobile']

    def list(self, request, *args, **kwargs):
        # Paginated all service providers
        response = super().list(request, *args, **kwargs)
        # Non-paginated accepted, rejected, and pending service providers
        accepted_qs = ServiceProviderForm.objects.filter(status='approved').order_by('-created_at')
        rejected_qs = ServiceProviderForm.objects.filter(status='rejected').order_by('-created_at')
        pending_qs = ServiceProviderForm.objects.filter(status='pending').order_by('-created_at')
        accepted_data = self.get_serializer(accepted_qs, many=True).data
        rejected_data = self.get_serializer(rejected_qs, many=True).data
        pending_data = self.get_serializer(pending_qs, many=True).data
        response.data = {
            'all': response.data,
            'accepted': accepted_data,
            'rejected': rejected_data,
            'pending': pending_data
        }
        return response

class ManageServiceProviderFormDetailUpdateView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    queryset = ServiceProviderForm.objects.all().order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return AdminServiceProviderUpdateStatusSerializer
        return ServiceProviderFormSerializer

    def retrieve(self, request,*args, **kwargs):
        queryset = self.get_object()
        serializers = self.get_serializer(queryset, context={'request': request})
        return Response({'message':"Fetched Successfully","status":True,"data":serializers.data},status=200)

    def update(self, request, *args, **kwargs):
        queryset = self.get_object()
        serializer = self.get_serializer(queryset, partial=True, data=request.data)
        if serializer.is_valid():
            try:
                serializer.save()
                return Response({'message':"Status Updated Successfully",'status':True},status=200)
            except ValidationError as e:
                # Handle ValidationError from serializer
                error_message = str(e.detail[0]) if hasattr(e, 'detail') and e.detail else str(e)
                return Response({'message': error_message, 'status': False}, status=400)
            except Exception as e:
                return Response({'message': f"Error occurred: {str(e)}", 'status': False}, status=400)
        return Response({'message':f"Error Occured: {serializer.errors}","status":False},status=400)


class ServiceProviderMyApplicationAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            form = ServiceProviderForm.objects.get(user=request.user)
            serializer = ServiceProviderFormSerializer(form, context={'request': request})
            return Response({'message': 'Fetched Successfully', 'status': True, 'data': serializer.data}, status=200)
        except ServiceProviderForm.DoesNotExist:
            return Response({'message': 'No application found for this user.', 'status': False}, status=404)
        
class ServiceProviderDashboardAPIView(generics.ListAPIView):
    permission_classes = [IsAdminUser]

    def list(self, request, *args, **kwargs):
        search_query = request.query_params.get('search', '').strip().lower()
        thirty_days_ago = timezone.now() - timedelta(days=30)

        all_forms = ServiceProviderForm.objects.select_related('user').all()
        total_count = all_forms.count()
        total_pending = all_forms.filter(status='pending').count()
        total_active = all_forms.filter(user__is_active=True).count()
        total_new_last_30_days = all_forms.filter(created_at__gte=thirty_days_ago).count()

        if search_query:
            forms = all_forms.filter(
                Q(user__country__icontains=search_query) |
                Q(user__city__icontains=search_query)
            )
        else:
            forms = all_forms

        location_summary = defaultdict(lambda: {
            'total': 0,
            'total_accepted': 0,
            'total_pending': 0,
            'total_rejected': 0,
            'cities': defaultdict(lambda: {'accepted': 0, 'pending': 0, 'rejected': 0})
        })

        for form in forms:
            user = form.user
            country = (user.country or 'Unknown').strip()
            city = (user.city or 'Unknown').strip()
            status = form.status.lower()

            status_key = 'accepted' if status == 'approved' else 'rejected' if status == 'rejected' else 'pending'

            location_summary[country]['total'] += 1
            location_summary[country][f'total_{status_key}'] += 1
            location_summary[country]['cities'][city][status_key] += 1

        structured_summary = []
        for country, data in location_summary.items():
            country_data = {
                'country': country,
                'total': data['total'],
                'total_accepted': data['total_accepted'],
                'total_pending': data['total_pending'],
                'total_rejected': data['total_rejected'],
                'cities': []
            }

            for city, stats in data['cities'].items():
                country_data['cities'].append({
                    'city': city,
                    'total': stats['accepted'] + stats['pending'] + stats['rejected'],
                    'accepted': stats['accepted'],
                    'pending': stats['pending'],
                    'rejected': stats['rejected'],
                })

            structured_summary.append(country_data)
        all_services = AllService.objects.all()

        return Response({
            "total_service_providers": total_count,
            "total_pending": total_pending,
            "total_active": total_active,
            "total_new_last_30_days": total_new_last_30_days,
            "summary": structured_summary,
            "service": {"total_services_count": all_services.count(),
            "total_pending_services": all_services.filter(form_status='pending').count(),
            "total_approved_services": all_services.filter(form_status='approved').count(),
            "pending_services": AllServiceSerializer(all_services.filter(form_status="pending"), many=True).data,
            "approved_services": AllServiceSerializer(all_services.filter(form_status="approved"), many=True).data,
            "rejected_services": AllServiceSerializer(all_services.filter(form_status="rejected"), many=True).data,}
        })
    
class ServiceProviderByCountryAPIView(generics.ListAPIView):
    serializer_class = ManageServiceProviderLISTSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        country_name = self.kwargs.get('country_name', '').strip()
        search = self.request.query_params.get('search', '').strip()
        status = self.request.query_params.get('status', '').strip().lower()

        # Start with service providers filtered by country
        users = User.objects.filter(
    Q(country__icontains=country_name) | Q(city__icontains=country_name),
    is_service_provider=True
)

        # Apply search on basic user fields
        if search:
            users = users.filter(
                Q(email__icontains=search) |
                Q(username__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        # Filter by status from ServiceProviderForm
        if status:
            user_ids = ServiceProviderForm.objects.filter(status__iexact=status).values_list('user_id', flat=True)
            users = users.filter(id__in=user_ids)

        return users.order_by('-created_at')