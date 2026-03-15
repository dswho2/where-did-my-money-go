from rest_framework import serializers
from .models import Account, Category, Enrollment, Transaction


class EnrollmentSerializer(serializers.ModelSerializer):
    accounts = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = ['id', 'institution_name', 'created_at', 'accounts']

    def get_accounts(self, obj):
        return AccountSerializer(obj.accounts.all(), many=True).data


class AccountSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source='enrollment.institution_name', read_only=True)

    class Meta:
        model = Account
        fields = [
            'id', 'teller_id', 'name', 'last_four', 'account_type',
            'institution_name', 'balance_ledger', 'balance_available', 'tracked',
        ]
        read_only_fields = ['id', 'teller_id', 'name', 'last_four', 'account_type', 'institution_name', 'balance_ledger', 'balance_available']


class CategorySerializer(serializers.ModelSerializer):
    usage = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = ['id', 'name', 'color', 'usage']


class TransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_color = serializers.CharField(source='category.color', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'teller_id', 'date', 'amount', 'merchant',
            'description', 'category', 'category_name', 'category_color',
            'confirmed', 'declined', 'account', 'account_name',
        ]
        read_only_fields = ['teller_id', 'date', 'amount', 'merchant', 'account']

    def get_account_name(self, obj):
        parts = [obj.account.name]
        if obj.account.last_four:
            parts.append(f'···· {obj.account.last_four}')
        return ' '.join(parts)
