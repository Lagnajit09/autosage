import uuid
from django.db import migrations, models

def update_foreign_keys(apps, schema_editor):
    Vault = apps.get_model('vault', 'Vault')
    Credential = apps.get_model('vault', 'Credential')
    Server = apps.get_model('vault', 'Server')

    # Update Credential.vault_id
    for cred in Credential.objects.all():
        cred.vault_uuid = cred.vault.uuid
        cred.save()

    # Update Server.vault_id and Server.credential_id
    for server in Server.objects.all():
        server.vault_uuid = server.vault.uuid
        if server.credential:
            server.credential_uuid = server.credential.uuid
        server.save()

class Migration(migrations.Migration):

    dependencies = [
        ('vault', '0005_add_uuid_field'),
    ]

    operations = [
        # Add temporary uuid-based foreign key fields
        migrations.AddField(
            model_name='credential',
            name='vault_uuid',
            field=models.UUIDField(null=True),
        ),
        migrations.AddField(
            model_name='server',
            name='vault_uuid',
            field=models.UUIDField(null=True),
        ),
        migrations.AddField(
            model_name='server',
            name='credential_uuid',
            field=models.UUIDField(null=True),
        ),
        # Populate them
        migrations.RunPython(update_foreign_keys),
        
        # Remove old foreign keys
        migrations.RemoveField(model_name='credential', name='vault'),
        migrations.RemoveField(model_name='server', name='vault'),
        migrations.RemoveField(model_name='server', name='credential'),
        
        # Remove old primary keys (id)
        migrations.RemoveField(model_name='vault', name='id'),
        migrations.RemoveField(model_name='credential', name='id'),
        migrations.RemoveField(model_name='server', name='id'),
        
        # Rename uuid to id and make it primary key
        migrations.RenameField(model_name='vault', old_name='uuid', new_name='id'),
        migrations.AlterField(
            model_name='vault',
            name='id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
        ),
        
        migrations.RenameField(model_name='credential', old_name='uuid', new_name='id'),
        migrations.AlterField(
            model_name='credential',
            name='id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
        ),
        
        migrations.RenameField(model_name='server', old_name='uuid', new_name='id'),
        migrations.AlterField(
            model_name='server',
            name='id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
        ),
        
        # Re-add foreign keys pointing to new UUID primary keys
        migrations.AddField(
            model_name='credential',
            name='vault',
            field=models.ForeignKey(to='vault.Vault', on_delete=models.CASCADE, related_name='credentials', null=True),
        ),
        migrations.AddField(
            model_name='server',
            name='vault',
            field=models.ForeignKey(to='vault.Vault', on_delete=models.CASCADE, related_name='servers', null=True),
        ),
        migrations.AddField(
            model_name='server',
            name='credential',
            field=models.ForeignKey(to='vault.Credential', on_delete=models.SET_NULL, null=True, blank=True, related_name='servers'),
        ),
    ]
