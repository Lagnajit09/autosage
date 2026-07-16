# Generated for the Day Pass local receipt (billing history) feature.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('billing', '0002_subscription_day_pass'),
    ]

    operations = [
        migrations.CreateModel(
            name='DayPassPurchase',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order_id', models.CharField(max_length=255, unique=True)),
                ('payment_id', models.CharField(blank=True, max_length=255)),
                ('amount', models.PositiveIntegerField(help_text='Amount in the smallest currency unit (paise).')),
                ('currency', models.CharField(default='INR', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='day_pass_purchases', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'billing_day_pass_purchases',
                'ordering': ['-created_at'],
            },
        ),
    ]
