from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from rest_framework.permissions import  IsAuthenticated, IsAdminUser, AllowAny
from authentication.models import *
from authentication.serializers import *
from authentication.utils import CustomPagination
from collections import defaultdict
import logging
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q, Avg
from subscription.models import UserAndExpertContract
from ai_itinerary.models import ReviewRating
from subscription.serializers import UserAndExpertContractSerializer
from ai_itinerary.serializers import ReviewRatingSerializer, UserSerializer
from decimal import Decimal
from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth

logger = logging.getLogger('travelDNA')


class LocalExpertCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        # Prevent duplicate form submission for the same user
        if LocalExpertForm.objects.filter(user=user).exists():
            return Response(
                {'message': 'You have already submitted the Local Expert form. You cannot submit it again.', 'status': False},
                status=400
            )
        
        serializer = LocalExpertCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            try:
                # Save the local expert form (serializer will handle user updates)
                serializer.save()
                
                return Response({
                    'message': 'Your Request for Becoming a Local Expert is submitted Successfully. You will be notified once you are verified. Stay Still',
                    'status': True
                }, status=200)
            except Exception as e:
                # Handle any unexpected errors (like database constraints)
                return Response({
                    'message': f'An error occurred while processing your request: {str(e)}',
                    'status': False
                }, status=400)
        
        return Response({'message': serializer.errors, 'status': False}, status=400)
class RetrieveLocalExpertStatus(generics.ListAPIView):
    serializer_class = LocalExpertFormListSerializer
    permission_classes = [IsAuthenticated]
    queryset = LocalExpertForm.objects.all()
    

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().filter(user=request.user).first()
        if not queryset:
            return Response({'message':"Not Found","status":False},status=404)
        serializer = self.get_serializer(instance = queryset)
        return Response({'message':'Fetched Successfully','data':serializer.data,'status':True},status=200)
    
class LocalExpertAdminListAPIView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    pagination_class = CustomPagination
    queryset = LocalExpertForm.objects.all().order_by('-created_at')
    serializer_class = LocalExpertFormListSerializer

    def list(self, request, *args, **kwargs):
        # Paginated all experts
        response = super().list(request, *args, **kwargs)
        # Non-paginated accepted, rejected, and pending experts
        accepted_qs = LocalExpertForm.objects.filter(status='approved').order_by('-created_at')
        rejected_qs = LocalExpertForm.objects.filter(status='rejected').order_by('-created_at')
        pending_qs = LocalExpertForm.objects.filter(status='pending').order_by('-created_at')
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

class LocalExpertAdminDetailUpdateAPIView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    queryset = LocalExpertForm.objects.all().order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return LocalExpertRegisterationStatusSerializer
        return LocalExpertFormListSerializer

    def retrieve(self, request,*args, **kwargs):
        queryset = self.get_object()
        serializers = self.get_serializer(queryset, context={'request': request})
        return Response({'message':"Fetched Successfully","status":True,"data":serializers.data},status=200)
    
    def update(self, request,*args,**kwargs):
        queryset = self.get_object()
        serializer = self.get_serializer(queryset, partial=True, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({'message':"Status Updated Successfully",'status':True},status=200)
        return Response({'message':f"Error Occured: {serializer.errors}","status":False},status=400)

class SearchLocalExertAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        search = request.query_params.get('search', '')
        
        # Base query for local experts
        experts = User.objects.using('default').filter(is_local_expert=True)
        
        # Only apply search filter if search parameter is provided and not empty
        if search and search.strip():
            experts = experts.filter(
                Q(city__icontains=search) | Q(country__icontains=search)
            )

        serializer = UserWithReviewsSerializer(experts, many=True)
        return Response({
            "message": "Experts fetched Successfully",
            "data": serializer.data,
            "status": True
        }, status=200)

class LocalExpertMyApplicationAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            form = LocalExpertForm.objects.get(user=request.user)
            serializer = LocalExpertFormListSerializer(form, context={'request': request})
            return Response({'message': 'Fetched Successfully', 'status': True, 'data': serializer.data}, status=200)
        except LocalExpertForm.DoesNotExist:
            return Response({'message': 'No application found for this user.', 'status': False}, status=404)

class LocalExpertDashboardAPIView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        if request.user.is_superuser == True:
            search_query = request.query_params.get('search', '').strip().lower()
            thirty_days_ago = timezone.now() - timedelta(days=30)

            # === Unfiltered forms for totals ===
            all_forms = LocalExpertForm.objects.select_related('user').all()

            total_count = all_forms.count()
            total_pending = all_forms.filter(status='pending').count()
            total_active = all_forms.filter(user__is_active=True).count()
            total_new_last_30_days = all_forms.filter(created_at__gte=thirty_days_ago).count()

            # === Filtered forms for summary only ===
            if search_query:
                forms = all_forms.filter(
                    Q(user__country__icontains=search_query) |
                    Q(user__city__icontains=search_query)
                )
            else:
                forms = all_forms

            # === Location-wise summary ===
            location_summary = defaultdict(lambda: {
                'total': 0,
                'total_accepted': 0,
                'total_pending': 0,
                'total_rejected': 0,
                'cities': defaultdict(lambda: {'accepted': 0, 'pending': 0, 'rejected': 0})
            })

            for form in forms:
                user = form.user
                if not user:
                    continue

                country = (user.country or 'Unknown').strip()
                city = (user.city or 'Unknown').strip()
                status = form.status.lower()

                status_key = 'accepted' if status == 'approved' else 'rejected' if status == 'rejected' else 'pending'

                location_summary[country]['total'] += 1
                location_summary[country][f'total_{status_key}'] += 1
                location_summary[country]['cities'][city][status_key] += 1

            # === Convert to structured list format ===
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

            return Response({
                "count": total_count,
                "total_pending": total_pending,
                "total_active": total_active,
                "total_new_last_30_days": total_new_last_30_days,
                "summary": structured_summary
            })
        elif request.user.is_local_expert == True:
            contracts = UserAndExpertContract.objects.filter(Q(created_by=request.user) | Q(created_for=request.user))
            ratings = ReviewRating.objects.filter(local_expert=request.user).all()
            average_rating = ratings.aggregate(avg_rating=Avg('rating'))['avg_rating'] or 0
            serialized_contracts = UserAndExpertContractSerializer(contracts.filter(status="accepted"), many=True).data
            for i, contract in enumerate(contracts.filter(status="accepted")):
                serialized_contracts[i]['created_by'] = UserSerializer(contract.created_by).data
                serialized_contracts[i]['created_for'] = UserSerializer(contract.created_for).data
            return Response({
                "count": contracts.count(),
                "active_contracts": contracts.filter(status="accepted").count(),
                "total_earnings": sum(contract.amount for contract in contracts.filter(status="accepted")),
                "rating":average_rating,
                "reviews": ratings.count(),
                "recent_feedback": ReviewRatingSerializer(ratings.order_by('-created_at')[:5],many=True).data,
                "list_active_contracts" : serialized_contracts,
            })
        else:
            return Response({"message":"Failed"}, status=400)
    
class LocalExpertByCountryAPIView(generics.ListAPIView):
    serializer_class = ManageLocalExpertLISTSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        country_name = self.kwargs.get('country_name', '').strip()
        search = self.request.query_params.get('search', '').strip()
        status = self.request.query_params.get('status', '').strip().lower()

        # Start with service providers filtered by country
        users = User.objects.filter(Q(country__icontains=country_name) | Q(city__icontains=country_name),is_local_expert=True)

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
            user_ids = LocalExpertForm.objects.filter(status__iexact=status).values_list('user_id', flat=True)
            users = users.filter(id__in=user_ids)

        return users.order_by('-created_at')
    
class LocalExpertBusinessProfileAPIView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self, request):
        queryset = LocalExpertForm.objects.filter(user=request.user).first()
        if not queryset:
            return Response({'message':"Not Found","status":False},status=404)
        return queryset
    
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset(request)
        serializer = LocalExpertBusinessProfileSerializer(instance = queryset, context={'request': request})
        return Response({'message':'Fetched Successfully','data':serializer.data,'status':True},status=200)
    

class LocalExpertEarningsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not request.user.is_local_expert:
            return Response(
                {'message': 'User is not a local expert.', 'status': False},
                status=400
            )

        qs = UserAndExpertContract.objects.filter(
            created_for=request.user,
            status__in=['accepted', 'completed']
        )

        # =======================
        # BASIC TOTALS
        # =======================
        total_earnings = qs.filter(
            status='completed'
        ).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        pending_earnings = qs.filter(
            status='accepted'
        ).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        # =======================
        # MONTH CALCULATIONS
        # =======================
        today = timezone.now()
        this_month_start = today.replace(day=1)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

        this_month_earnings = qs.filter(
            created_at__gte=this_month_start
        ).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        last_month_earnings = qs.filter(
            created_at__gte=last_month_start,
            created_at__lt=this_month_start
        ).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        # =======================
        # MONTH-WISE EARNINGS
        # =======================
        month_wise = (
            qs.annotate(month=TruncMonth('created_at'))
              .values('month')
              .annotate(earnings=Sum('amount'))
              .order_by('-month')
        )

        month_wise_earnings = [
            {
                'month': item['month'].strftime('%Y-%m'),
                'earnings': item['earnings']
            }
            for item in month_wise
        ]

        # =======================
        # AVERAGE & PEAK
        # =======================
        total_months = len(month_wise_earnings)
        average_monthly_earnings = (
            total_earnings / total_months if total_months else Decimal('0.00')
        )

        highest_month = max(
            month_wise_earnings,
            key=lambda x: x['earnings'],
            default={'month': None, 'earnings': Decimal('0.00')}
        )

        # =======================
        # CONTRACT KPIs
        # =======================
        contract_stats = qs.aggregate(
            total_contracts=Count('id'),
            completed_contracts=Count('id', filter=Q(status='completed')),
            pending_contracts=Count('id', filter=Q(status='accepted'))
        )

        # =======================
        # RESPONSE
        # =======================
        return Response({
            'status': True,
            'message': 'Earnings KPIs fetched successfully',
            'data': {
                'total_earnings': total_earnings,
                'pending_earnings': pending_earnings,
                'this_month_earnings': this_month_earnings,
                'last_month_earnings': last_month_earnings,
                'average_monthly_earnings': average_monthly_earnings,
                'highest_month_earnings': highest_month,
                'month_wise_earnings': month_wise_earnings,
                'contracts': contract_stats
            }
        }, status=200)
