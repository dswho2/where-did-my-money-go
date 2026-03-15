from django.db import migrations, models


def confirmed_declined_to_status(apps, schema_editor):
    Transaction = apps.get_model('expenses', 'Transaction')
    Transaction.objects.filter(declined=True).update(status='declined')
    Transaction.objects.filter(confirmed=True, declined=False).update(status='confirmed')
    # pending is already the default; remaining rows (confirmed=False, declined=False) stay as 'pending'


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0009_userbudgetconfig'),
    ]

    operations = [
        # 1. Add status with a default so existing rows are valid immediately
        migrations.AddField(
            model_name='transaction',
            name='status',
            field=models.CharField(
                max_length=10,
                choices=[('pending', 'Pending'), ('confirmed', 'Confirmed'), ('declined', 'Declined')],
                default='pending',
            ),
        ),
        # 2. Populate from the old booleans
        migrations.RunPython(confirmed_declined_to_status, migrations.RunPython.noop),
        # 3. Drop the old columns
        migrations.RemoveField(model_name='transaction', name='confirmed'),
        migrations.RemoveField(model_name='transaction', name='declined'),
    ]
