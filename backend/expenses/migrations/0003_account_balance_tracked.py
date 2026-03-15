from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0002_enrollment_user'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='balance_ledger',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='account',
            name='balance_available',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='account',
            name='tracked',
            field=models.BooleanField(default=True),
        ),
    ]
