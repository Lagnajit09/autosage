# Generated for the Pro Day Pass (one-time ₹99 pass) feature.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscription',
            name='credits_pass_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='subscription',
            name='last_credits_purchase_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='subscription',
            name='credits_order_id',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
