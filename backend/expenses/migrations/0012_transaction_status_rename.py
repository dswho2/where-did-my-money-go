from django.db import migrations, models


def rename_statuses(apps, schema_editor):
    Transaction = apps.get_model('expenses', 'Transaction')
    Transaction.objects.filter(status='pending').update(status='unreviewed')
    Transaction.objects.filter(status='confirmed').update(status='tracked')
    Transaction.objects.filter(status='declined').update(status='excluded')


def reverse_rename_statuses(apps, schema_editor):
    Transaction = apps.get_model('expenses', 'Transaction')
    Transaction.objects.filter(status='unreviewed').update(status='pending')
    Transaction.objects.filter(status='tracked').update(status='confirmed')
    Transaction.objects.filter(status='excluded').update(status='declined')


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0011_category_user'),
    ]

    operations = [
        migrations.RunPython(rename_statuses, reverse_code=reverse_rename_statuses),
        migrations.AlterField(
            model_name='transaction',
            name='status',
            field=models.CharField(
                choices=[('unreviewed', 'Unreviewed'), ('tracked', 'Tracked'), ('excluded', 'Excluded')],
                default='unreviewed',
                max_length=10,
            ),
        ),
    ]
