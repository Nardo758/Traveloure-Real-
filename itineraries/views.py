from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import *
from .serializers import *
from rest_framework import status, serializers
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from .models import Itinerary
from .serializers import ItinerarySerializer
from .pagination import CustomPagination
from rest_framework.decorators import action
from django.urls import reverse
from rest_framework.views import APIView
from .permissions import CategoryPermission


class ItineraryCategoryViewSet(viewsets.ModelViewSet):
    queryset = ItineraryCategory.objects.all()
    serializer_class = ItineraryCategorySerializer
    lookup_field = 'id'
    permission_classes = [IsAuthenticated,CategoryPermission]

    def perform_create(self, serializer):
        serializer.save()

    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({"message": "Category deleted successfully"}, status=status.HTTP_204_NO_CONTENT)

    
class ItineraryViewSet(viewsets.ModelViewSet):
    queryset = Itinerary.objects.all()
    serializer_class = ItinerarySerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # Assign the currently authenticated user as the trip planner
        serializer.save(trip_planner=self.request.user)

    def get_queryset(self):
        # Optionally filter to show only itineraries created by the current user
        if self.request.user.is_staff:
            return Itinerary.objects.filter(is_deleted=False).order_by('-created_at')
        return Itinerary.objects.filter(trip_planner=self.request.user, is_deleted=False).order_by('-created_at')
    
    def destroy(self, request, *args, **kwargs):
        itinerary = self.get_object()
        itinerary.is_deleted = True
        itinerary.save()
        return Response({"detail": "Itinerary deleted successfully."}, status=status.HTTP_204_NO_CONTENT)

class ItineraryDayViewSet(viewsets.ModelViewSet):
    serializer_class = ItineraryDaySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ItineraryDay.objects.filter(itinerary__trip_planner=self.request.user, itinerary__is_deleted = False)

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        itinerary = serializer.validated_data.get('itinerary')
        print('itinearary>>>>>> ', itinerary)

        # Check if itinerary exists and is not deleted
        if not itinerary or itinerary.is_deleted:
            return Response({'message': "Itinerary Not Found or Deleted"}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure user can only create days for their own itineraries
        if itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only add days to your own itineraries.")

        day_number = serializer.validated_data['day_number']
        if day_number < 1 or day_number > itinerary.days:
            raise serializers.ValidationError(f"Day number must be between 1 and {itinerary.days}.")

        # Ensure no duplicates for the same day number
        if ItineraryDay.objects.filter(itinerary=itinerary, day_number=day_number).exists():
            raise serializers.ValidationError(f"Day {day_number} already exists for this itinerary.")

        # Save the new ItineraryDay instance
        serializer.save(itinerary=itinerary)
        return Response({"message": "Itinerary Day Added Successfully"}, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        # Retrieve the existing ItineraryDay instance
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)  # Using partial=True for update
        serializer.is_valid(raise_exception=True)

        itinerary = serializer.validated_data.get('itinerary') 
        print('itinerary-------- ', itinerary)
        # Check if itinerary exists and is not deleted
        if not itinerary or itinerary.is_deleted:
            return Response({'message': "Itinerary Not Found or Deleted"}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure user can only update days for their own itineraries
        if itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only update days in your own itineraries.")

        # Save the updated ItineraryDay instance
        serializer.save(itinerary=itinerary)
        return Response({'message': "Itinerary Day Updated Successfully."}, status=status.HTTP_200_OK)


    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.itinerary.trip_planner != request.user:
            raise PermissionDenied("You can only delete days from your own itineraries.")
        
        # Perform the actual delete operation
        self.perform_destroy(instance)
        
        return Response({"detail": "Itinerary day deleted successfully."}, status=status.HTTP_204_NO_CONTENT)


class ItineraryPointViewSet(viewsets.ModelViewSet):
    serializer_class = ItineraryPointSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ItineraryPoint.objects.filter(itinerary_day__itinerary__trip_planner=self.request.user)

    def perform_create(self, serializer):
        itinerary_day = serializer.validated_data['itinerary_day']

        # Ensure user can only create points for their own itinerary days
        if itinerary_day.itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only add points to your own itinerary days.")

        serializer.save()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)  # Using partial=True for update
        serializer.is_valid(raise_exception=True)

        # Ensure user can only update points in their own itinerary days
        if instance.itinerary_day.itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only update points in your own itinerary days.")

        # Remove itinerary_day from the validated data before saving
        if 'itinerary_day' in serializer.validated_data:
            serializer.validated_data.pop('itinerary_day')

        # Save the updated instance
        serializer.save()

        return Response({'message':"Itinerary POint Updated Successfully."}, status=200)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.itinerary_day.itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only delete points from your own itinerary days.")
        
        self.perform_destroy(instance)
        return Response({"detail": "Itinerary Point deleted successfully."}, status=status.HTTP_204_NO_CONTENT)

class ItineraryMediaViewSet(viewsets.ModelViewSet):
    serializer_class = ItineraryMediaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ItineraryMedia.objects.filter(
            itinerary_point__itinerary_day__itinerary__trip_planner=self.request.user
        )

    def perform_create(self, serializer):
        itinerary_point = serializer.validated_data.get('itinerary_point')

        # Check if the itinerary point belongs to the current user
        if itinerary_point.itinerary_day.itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only create media for your own itinerary points.")

        serializer.save()

    def perform_update(self, serializer):
        itinerary_point = serializer.validated_data.get('itinerary_point', serializer.instance.itinerary_point)

        # Ensure the user owns the itinerary point they are updating media for
        if itinerary_point.itinerary_day.itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only update media for your own itinerary points.")
        serializer.validated_data.pop('itinerary_day', None)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Ensure the user owns the media they're trying to delete
        if instance.itinerary_point.itinerary_day.itinerary.trip_planner != self.request.user:
            raise PermissionDenied("You can only delete media from your own itinerary points.")
        
        instance.delete()
        return Response({"detail": "Media deleted successfully."}, status=status.HTTP_204_NO_CONTENT)

class ItineraryListViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Itinerary.objects.all().prefetch_related(
        'itinerary_days__points__media'
    )
    serializer_class = ItineraryDetailSerializer
    permission_classes = [AllowAny]
    pagination_class = CustomPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {
        'title': ['icontains'],
        'city': ['icontains']
    }

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset().filter(is_deleted=False).order_by('-created_at'))
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='share_link')
    def share_link(self, request, pk=None):
        itinerary = self.get_object()
        if itinerary.is_deleted==True:
            return Response({'message':"itenrary Not Found"}, status=404)
        link = request.build_absolute_uri(reverse('itinerary-all-detail', args=[itinerary.pk]))
        return Response({"shareable_link": link})

class SavedItineraryViewSet(viewsets.ModelViewSet):
    queryset = SavedItinerary.objects.all()
    serializer_class = SavedItinerarySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CustomPagination

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='save')
    def save_itinerary(self, request):
        itinerary_id = request.data.get('itinerary')
        itinerary = get_object_or_404(Itinerary, id=itinerary_id)

        if SavedItinerary.objects.filter(user=request.user, itinerary=itinerary).exists():
            return Response({'detail': 'Itinerary already saved.'}, status=status.HTTP_400_BAD_REQUEST)

        saved_itinerary = SavedItinerary.objects.create(user=request.user, itinerary=itinerary)
        serializer = self.get_serializer(saved_itinerary)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='unsave')
    def unsave_itinerary(self, request, pk=None):
        saved_itinerary = get_object_or_404(SavedItinerary, id=pk, user=request.user)
        saved_itinerary.delete()
        return Response({'detail': 'Itinerary unsaved.'}, status=status.HTTP_204_NO_CONTENT)
    
class ItineraryLikeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ItineraryLikeSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            result = serializer.save()
            return Response({"message": result})
        return Response(serializer.errors, status=400)


def get_likes_queryset(user, itinerary_id=None):
    """
    Fetch likes filtered by user and optional itinerary_id.
    """
    queryset = ItineraryLike.objects.select_related('itinerary').filter(user=user)
    if itinerary_id:
        queryset = queryset.filter(itinerary_id=itinerary_id)
    return queryset.filter(itinerary__is_deleted=False)

class ItineraryLikesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, itinerary_id):
        # Ensure user can only view their own likes
        likes = get_likes_queryset(user=request.user, itinerary_id=itinerary_id)
        if not likes.exists():
            return Response({"message": "No likes found for this itinerary."}, status=404)
        
        serializer = ItineraryLikeListSerializer(likes, many=True)
        return Response(serializer.data)

class AllItineraryLikesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get all likes for the current user
        likes = get_likes_queryset(user=request.user)
        if not likes.exists():
            return Response({"message": "No liked itineraries found."}, status=404)
        
        serializer = ItineraryLikeListSerializer(likes, many=True)
        return Response(serializer.data)

def get_reports_queryset(user, itinerary_id=None):
    """
    Fetch reports filtered by user and optional itinerary_id.
    """
    queryset = ItineraryReport.objects.select_related('itinerary').filter(user=user)
    if itinerary_id:
        queryset = queryset.filter(itinerary_id=itinerary_id)
    return queryset

class ItineraryReportsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, itinerary_id):
        # Filter reports for the current user and specific itinerary
        reports = get_reports_queryset(user=request.user, itinerary_id=itinerary_id)
        if not reports.exists():
            return Response({"message": "No reports found for this itinerary."}, status=404)
        
        serializer = ItineraryReportListSerializer(reports, many=True)
        return Response(serializer.data)

class AllItineraryReportsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get all reports by the current user
        reports = get_reports_queryset(user=request.user)
        if not reports.exists():
            return Response({"message": "No reported itineraries found."}, status=404)
        
        serializer = ItineraryReportListSerializer(reports, many=True)
        return Response(serializer.data)
    
class ItineraryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ItineraryReportSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "Itinerary reported successfully."})
        return Response(serializer.errors, status=400)