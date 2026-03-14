from django.db import models


class Enrollment(models.Model):
    """Teller enrollment — one per bank login."""
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

    def __str__(self):
        return f"{self.name} ...{self.last_four}"


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class Transaction(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transactions')
    teller_id = models.CharField(max_length=255, unique=True)
    date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    merchant = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    confirmed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"{self.date} {self.merchant} ${self.amount}"
