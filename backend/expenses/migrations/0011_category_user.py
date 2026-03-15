from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def assign_categories_to_first_user(apps, schema_editor):
    Category = apps.get_model('expenses', 'Category')
    User = apps.get_model('auth', 'User')
    first_user = User.objects.order_by('pk').first()
    if first_user:
        Category.objects.filter(user__isnull=True).update(user=first_user)


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0010_transaction_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add user as nullable so existing rows don't violate the constraint
        migrations.AddField(
            model_name='category',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 2. Assign existing categories to the first user
        migrations.RunPython(assign_categories_to_first_user, migrations.RunPython.noop),
        # 3. Make user non-nullable now that all rows are assigned
        migrations.AlterField(
            model_name='category',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 4. Remove the old global unique constraint on name
        migrations.AlterField(
            model_name='category',
            name='name',
            field=models.CharField(max_length=100),
        ),
        # 5. Add the per-user unique constraint
        migrations.AlterUniqueTogether(
            name='category',
            unique_together={('user', 'name')},
        ),
    ]
