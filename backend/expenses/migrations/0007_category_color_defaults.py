from django.db import migrations

PALETTE = [
    '#818cf8', '#34d399', '#fb923c', '#f472b6',
    '#60a5fa', '#a78bfa', '#facc15', '#2dd4bf',
    '#f87171', '#4ade80', '#e879f9', '#38bdf8',
]


def assign_colors(apps, schema_editor):
    Category = apps.get_model('expenses', 'Category')
    categories = list(Category.objects.order_by('id'))
    for i, cat in enumerate(categories):
        cat.color = PALETTE[i % len(PALETTE)]
    Category.objects.bulk_update(categories, ['color'])


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0006_category_color'),
    ]

    operations = [
        migrations.RunPython(assign_colors, migrations.RunPython.noop),
    ]
