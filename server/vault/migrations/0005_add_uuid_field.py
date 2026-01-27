import uuid
from django.db import migrations, models

def create_uuid(apps, schema_editor):
    Vault = apps.get_model('vault', 'Vault')
    Credential = apps.get_model('vault', 'Credential')
    Server = apps.get_model('vault', 'Server')
    
    for obj in Vault.objects.all():
        obj.uuid = uuid.uuid4()
        obj.save()
    for obj in Credential.objects.all():
        obj.uuid = uuid.uuid4()
        obj.save()
    for obj in Server.objects.all():
        obj.uuid = uuid.uuid4()
        obj.save()

class Migration(migrations.Migration):

    dependencies = [
        ('vault', '0004_alter_credential_vault_alter_server_vault'),
    ]

    operations = [
        # 1. Add uuid field as non-primary key first
        migrations.AddField(
            model_name='vault',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='credential',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='server',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        # 2. Populate UUIDs
        migrations.RunPython(create_uuid),
        # 3. Make them unique and not null
        migrations.AlterField(
            model_name='vault',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name='credential',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name='server',
            name='uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
