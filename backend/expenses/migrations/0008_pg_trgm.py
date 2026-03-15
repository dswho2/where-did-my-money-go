from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0007_category_color_defaults'),
    ]

    operations = [
        migrations.RunSQL(
            sql='CREATE EXTENSION IF NOT EXISTS pg_trgm;',
            reverse_sql='DROP EXTENSION IF EXISTS pg_trgm;',
        ),
    ]
