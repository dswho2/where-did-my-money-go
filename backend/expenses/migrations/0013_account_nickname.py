from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0012_transaction_status_rename'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='nickname',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
