from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scripts', '0004_script_is_library'),
    ]

    operations = [
        migrations.AddField(
            model_name='script',
            name='parameters',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
