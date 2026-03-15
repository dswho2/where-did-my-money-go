from django.conf import settings
from django.db import models


class Enrollment(models.Model):
    """Teller enrollment — one per bank login, scoped to a user."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='enrollments')
    institution_name = models.CharField(max_length=255)
    access_token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.institution_name} ({self.id})"


class Account(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='accounts')
    teller_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    last_four = models.CharField(max_length=4, blank=True)
    account_type = models.CharField(max_length=50)  # e.g. "credit", "depository"
    balance_ledger = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    balance_available = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tracked = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ...{self.last_four}"


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=7, default='#818cf8')

    class Meta:
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class MerchantRule(models.Model):
    """Per-user merchant → category mapping table for fast auto-categorization."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='merchant_rules')
    merchant_key = models.CharField(max_length=255)   # normalized for matching
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('user', 'merchant_key')]

    def __str__(self):
        return f"{self.merchant_key} → {self.category}"


class UserBudgetConfig(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='budget_config')
    config = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"BudgetConfig({self.user})"


class Transaction(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transactions')
    teller_id = models.CharField(max_length=255, unique=True)
    date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    merchant = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    confirmed = models.BooleanField(default=False)
    declined = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.date} {self.merchant} ${self.amount}"
