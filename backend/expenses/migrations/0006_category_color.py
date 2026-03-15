from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0005_merchantrule'),
    ]

    operations = [
        migrations.AddField(
            model_name='category',
            name='color',
            field=models.CharField(max_length=7, default='#818cf8'),
        ),
    ]
