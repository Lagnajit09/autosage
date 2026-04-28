# Generated for the workflow completion email feature.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('execution_engine', '0006_alter_scriptexecution_credential_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowrun',
            name='send_email',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='workflowrun',
            name='notification_email',
            field=models.EmailField(blank=True, max_length=254),
        ),
    ]
