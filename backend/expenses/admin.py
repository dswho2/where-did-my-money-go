from django.contrib import admin
from .models import Enrollment, Account, Category, Transaction, MerchantRule


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ['institution_name', 'created_at']
    readonly_fields = ['created_at']


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'last_four', 'account_type', 'enrollment']
    list_select_related = ['enrollment']


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name']


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ['date', 'merchant', 'amount', 'category', 'confirmed', 'account']
    list_filter = ['confirmed', 'category', 'account']
    list_select_related = ['category', 'account']
    search_fields = ['merchant', 'description']
    date_hierarchy = 'date'


@admin.register(MerchantRule)
class MerchantRuleAdmin(admin.ModelAdmin):
    list_display = ['merchant_key', 'category', 'user', 'updated_at']
    list_filter = ['category', 'user']
    list_select_related = ['category', 'user']
    search_fields = ['merchant_key']
