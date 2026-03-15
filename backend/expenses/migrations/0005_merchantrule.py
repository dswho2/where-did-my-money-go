from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0004_transaction_declined'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MerchantRule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('merchant_key', models.CharField(max_length=255)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='expenses.category')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='merchant_rules', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('user', 'merchant_key')},
            },
        ),
    ]
