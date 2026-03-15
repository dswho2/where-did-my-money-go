import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add nullable first so existing rows don't violate the constraint
        migrations.AddField(
            model_name='enrollment',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='enrollments',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # Assign any orphaned rows to user pk=1 (your superuser)
        migrations.RunSQL(
            sql='UPDATE expenses_enrollment SET user_id = 1 WHERE user_id IS NULL',
            reverse_sql=migrations.RunSQL.noop,
        ),
        # Now make it non-nullable
        migrations.AlterField(
            model_name='enrollment',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='enrollments',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
