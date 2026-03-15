from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0003_account_balance_tracked'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='declined',
            field=models.BooleanField(default=False),
        ),
    ]
