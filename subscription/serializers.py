from rest_framework import serializers
from decimal import Decimal
from authentication.models import User
from .models import Wallet, WalletTransaction, APIUsage, UserAndExpertContract, CreatedBy, ContractTransaction
# OLD SUBSCRIPTION SYSTEM - COMMENTED OUT FOR PAY-AS-YOU-GO WALLET SYSTEM
# from .models import Plan

# class PlanSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Plan
#         fields = "__all__"

class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ['balance', 'created_at', 'updated_at']

class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ['transaction_type', 'credits', 'description', 'created_at']

class APIUsageSerializer(serializers.ModelSerializer):
    class Meta:
        model = APIUsage
        fields = ['api_name', 'cost_per_call', 'created_at']

class WalletRechargeSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('5.00'))
    
    def validate_amount(self, value):
        if value < 5.00:
            raise serializers.ValidationError("Minimum recharge amount is $5.00")
        return value
    

class UserAndExpertContractSerializer(serializers.ModelSerializer):
    id_created_for = serializers.UUIDField(write_only=True)
    user_name = serializers.CharField(source='user_id.username', read_only=True)
    expert_name = serializers.CharField(source='expert_id.username', read_only=True)

    class Meta:
        model = UserAndExpertContract
        fields = ["id", "user_id", "expert_id", "user_name", "id_created_for", "expert_name", "contract_title", "trip_to", "description", "attachment", "contract_created_by", "is_accepted", "amount", "is_paid"]
        read_only_fields = ["id", "created_at", "user_id", "expert_id", "is_paid", "contract_created_by"]


    def validate_id_created_for(self, value):
        if not User.objects.filter(id = value).exists():
            raise serializers.ValidationError("Target user not Found")
        
        return value
    
    def validate(self, attrs):
        is_accepted = attrs.get("is_accepted")
        amount = attrs.get("amount")

        if is_accepted is True and amount is not None:
            raise serializers.ValidationError(
                {"amount": "Amount must be null when is_accepted is true."}
            )

        # Case 2: Not accepted → price must not be null
        if is_accepted is False and amount is None:
            raise serializers.ValidationError(
                {"amount": "Amount is required when is_accepted is false."}
            )
        
        return attrs
    
    def create(self, validated_data):
        contract = None
        request = self.context["request"]
        logged_in_user = request.user
        id_created_for = validated_data.pop("id_created_for")

        try:
            target_user = User.objects.get(id=id_created_for)
        except User.DoesNotExist:
            raise serializers.ValidationError({"id_created_for": "Target user does not exist."})

        if logged_in_user.is_local_expert == target_user.is_local_expert:
            raise serializers.ValidationError(
                {"id_created_for": "Both users cannot have the same role (both expert or both user)."}
            )
        
        if logged_in_user.is_local_expert:
            validated_data["expert_id"] = User.objects.filter(id = logged_in_user.id, is_local_expert = True).first()
            validated_data["user_id"] = User.objects.filter(id = id_created_for, is_local_expert = False).first()
            validated_data["contract_created_by"] = CreatedBy.EXPERT
            
            contract = UserAndExpertContract.objects.filter(
                expert_id = logged_in_user.id,
                user_id = id_created_for,
                is_paid = False, 
            ).first()

        elif logged_in_user.is_local_expert == False and logged_in_user.is_service_provider == False:
            validated_data["expert_id"] = User.objects.filter(id = id_created_for, is_local_expert = True).first()
            validated_data["user_id"] = User.objects.filter(id = logged_in_user.id, is_local_expert = False).first()
            validated_data["contract_created_by"] = CreatedBy.USER

            contract = UserAndExpertContract.objects.filter(
                expert_id = id_created_for,
                user_id = logged_in_user.id,
                is_paid = False, 
            ).first()
         
        if contract:
            raise serializers.ValidationError(
                {"error": "There is already a contract present which is not paid."}
            )

        validated_data["is_accepted"] = False
        return UserAndExpertContract.objects.create(**validated_data)
    

class ContractTransactionSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user_id.username', read_only=True)
    expert_name = serializers.CharField(source='expert_id.username', read_only=True)

    class Meta:
        model = ContractTransaction
        fields = ["id", "contract_id", "user_name", "expert_name", "user_id", "expert_id", "amount", "transaction_id", "payment_status", "is_succeeded", "transaction_type", "paid_to_expert"]
        read_only_fields = ["id", "created_at", "user_id", "expert_id", "paid_to_expert"]

    def to_representation(self, instance):
        """Customize response based on logged-in user role."""
        representation = super().to_representation(instance)
        request = self.context.get("request")

        if request and not request.user.is_local_expert:
            # Remove paid_to_expert if user is not expert
            representation.pop("paid_to_expert", None)

        return representation