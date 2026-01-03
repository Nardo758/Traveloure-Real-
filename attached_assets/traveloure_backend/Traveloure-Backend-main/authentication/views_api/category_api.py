from rest_framework.response import Response
from rest_framework import generics
from rest_framework.permissions import  IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from authentication.models import *
from authentication.serializers import *


class CategoryAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        local_expert_id = self.request.query_params.get("expert_id")
        search = self.request.query_params.get("search")
        is_default_param = self.request.query_params.get("is_default")

        qs = Category.objects.all()

        # --- Superuser logic ---
        if user.is_superuser:
            if local_expert_id:
                qs = qs.filter(user_id=local_expert_id)
            if is_default_param is not None:
                qs = qs.filter(is_default=is_default_param.lower() == "true")
            if search:
                qs = qs.filter(name__icontains=search)
            return qs.distinct().order_by('-created_at')
        if hasattr(user, "is_local_expert") and user.is_local_expert:
            own_qs = Category.objects.filter(user=user)
            default_qs = Category.objects.filter(is_default=True)

            # Exclude defaults with same names as own categories
            own_names = own_qs.values_list("name", flat=True)
            merged_qs = own_qs | default_qs.exclude(name__in=own_names)
            qs = merged_qs.distinct()

            if is_default_param is not None:
                qs = qs.filter(is_default=is_default_param.lower() == "true")
            if search:
                qs = qs.filter(name__icontains=search)

            return qs.order_by('-created_at')

        if not local_expert_id:
            return Category.objects.none()

        try:
            expert = User.objects.get(id=local_expert_id, is_local_expert=True)
        except User.DoesNotExist:
            return Category.objects.none()

        qs = Category.objects.filter(
            Q(user=expert) | Q(is_default=True)
        ).distinct()

        if is_default_param is not None:
            qs = qs.filter(is_default=is_default_param.lower() == "true")
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.order_by('-created_at')
    
    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, "is_local_expert") and user.is_local_expert:
            serializer.save(user=user)
            return
        if hasattr(user, "is_superuser") and user.is_superuser:
            serializer.save(user=None, is_default=True)
            return
        else:
            raise PermissionDenied("Only local experts can create categories.")
        
class CategoryDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    lookup_field = "id"

    def get_object(self):
        obj = super().get_object()
        user = self.request.user

        if user.is_superuser:
            return obj

        if getattr(user, "is_local_expert", False):
            if obj.user == user or obj.is_default:
                return obj

        raise PermissionDenied("You do not have permission to access this category.")
    
    def update(self, request, *args, **kwargs):
        """
        Force all updates to be treated as partial (PATCH-style),
        even if the request uses PUT.
        """
        partial = True  # force partial behavior
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def perform_update(self, serializer):
        user = self.request.user
        category = self.get_object()

        if user.is_superuser:
            serializer.save()
            return

        if getattr(user, "is_local_expert", False) and category.user == user:
            serializer.save()
            return

        raise PermissionDenied("You do not have permission to update this category.")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = self.request.user

        if user.is_superuser:
            instance.delete()
            return Response({"message":"Category Deleted Successfully","data":[],"status":True},status=204)

        elif getattr(user, "is_local_expert", False) and instance.user == user:
            instance.delete()

            return Response({"message":"Category Deleted Successfully","data":[],"status":True},status=204)
        else:
            return Response({"message":"You do not have permission to delete this category.","data":[],"status":False},status=403)


class SubCategoryAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubCategorySerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        category_id = self.request.query_params.get("category_id")
        search = self.request.query_params.get("search")
        is_default_param = self.request.query_params.get("is_default")
        order_by_field = self.request.query_params.get("order_by", "created_at")  # default: created_at
        order_dir = self.request.query_params.get("order_dir", "desc")  # default: descending

        qs = SubCategory.objects.all()

        # --- Superuser logic ---
        if user.is_superuser:
            if category_id:
                qs = qs.filter(category_id=category_id)
            if is_default_param is not None:
                qs = qs.filter(is_default=is_default_param.lower() == "true")
            if search:
                qs = qs.filter(name__icontains=search)
            return qs.distinct().order_by(
                f"{'-' if order_dir.lower() == 'desc' else ''}{order_by_field}"
            )

        # --- Local expert logic ---
        if hasattr(user, "is_local_expert") and user.is_local_expert:
            own_qs = SubCategory.objects.filter(user=user)
            default_qs = SubCategory.objects.filter(is_default=True)

            # Exclude default subcategories with same names as user's own
            own_names = own_qs.values_list("name", flat=True)
            merged_qs = own_qs | default_qs.exclude(name__in=own_names)
            qs = merged_qs.distinct()

            if category_id:
                qs = qs.filter(category_id=category_id)
            if is_default_param is not None:
                qs = qs.filter(is_default=is_default_param.lower() == "true")
            if search:
                qs = qs.filter(name__icontains=search)

            return qs.order_by(
                f"{'-' if order_dir.lower() == 'desc' else ''}{order_by_field}"
            )

        # --- Normal user / client logic ---
        if not category_id:
            return SubCategory.objects.none()

        try:
            category = Category.objects.get(id=category_id)
        except Category.DoesNotExist:
            return SubCategory.objects.none()

        qs = SubCategory.objects.filter(category=category).distinct()

        if is_default_param is not None:
            qs = qs.filter(is_default=is_default_param.lower() == "true")
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.order_by(
            f"{'-' if order_dir.lower() == 'desc' else ''}{order_by_field}"
        )
    
    def create(self, request, *args, **kwargs):
        user = request.user
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if hasattr(user, "is_superuser") and user.is_superuser:
            serializer.save(user=None, is_default=True)
            return Response({"message":"Subcategory created successfully.","data":serializer.data,"status":True},status=201)
        elif hasattr(user, "is_local_expert") and user.is_local_expert:
            serializer.save(user=request.user, is_default=False)
            return Response({"message":"Subcategory created successfully.","data":serializer.data,"status":True},status=201)
        
        return super().create(request, *args, **kwargs)
    
class SubCategoryDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubCategorySerializer
    queryset = SubCategory.objects.all()
    lookup_field = "id"

    def get_object(self):
        obj = super().get_object()
        user = self.request.user

        if user.is_superuser:
            return obj

        if getattr(user, "is_local_expert", False):
            if obj.user == user or obj.is_default:
                return obj

        raise PermissionDenied("You do not have permission to access this subcategory.")
    
    def update(self, request, *args, **kwargs):
        """
        Force all updates to be treated as partial (PATCH-style),
        even if the request uses PUT.
        """
        partial = True  # force partial behavior
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response({"data":serializer.data,"message":"Subcategory updated successfully.","status":True},status=200)
    
    def perform_update(self, serializer):
        user = self.request.user
        subcategory = self.get_object()

        if user.is_superuser:
            serializer.save()
            return

        if getattr(user, "is_local_expert", False) and subcategory.user == user:
            serializer.save()
            return

        raise PermissionDenied("You do not have permission to update this subcategory.")
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = self.request.user

        if user.is_superuser:
            instance.delete()
            return Response({"message":"Subcategory Deleted Successfully","data":[],"status":True},status=204)

        elif getattr(user, "is_local_expert", False) and instance.user == user:
            instance.delete()

            return Response({"message":"Subcategory Deleted Successfully","data":[],"status":True},status=204)
        else:
            return Response({"message":"You do not have permission to delete this subcategory.","data":[],"status":False},status=403)