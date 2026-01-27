import uuid
from django.db import migrations, models, transaction

def migrate_data_to_new_fks(apps, schema_editor):
    Vault = apps.get_model('vault', 'Vault')
    Credential = apps.get_model('vault', 'Credential')
    Server = apps.get_model('vault', 'Server')

    # Update Credential.vault
    for cred in Credential.objects.all():
        if cred.vault_uuid:
            try:
                vault = Vault.objects.get(id=cred.vault_uuid)
                cred.vault = vault
                cred.save()
            except Vault.DoesNotExist:
                pass

    # Update Server.vault and Server.credential
    for server in Server.objects.all():
        if server.vault_uuid:
            try:
                vault = Vault.objects.get(id=server.vault_uuid)
                server.vault = vault
            except Vault.DoesNotExist:
                pass
        if server.credential_uuid:
            try:
                cred = Credential.objects.get(id=server.credential_uuid)
                server.credential = cred
            except Credential.DoesNotExist:
                pass
        server.save()

class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('vault', '0006_switch_to_uuid_pk'),
    ]

    operations = [
        # Populate the new foreign key fields using the stored UUIDs
        migrations.RunPython(migrate_data_to_new_fks),
        
        # Enforce non-null on required foreign keys
        migrations.AlterField(
            model_name='credential',
            name='vault',
            field=models.ForeignKey(to='vault.Vault', on_delete=models.CASCADE, related_name='credentials'),
        ),
        migrations.AlterField(
            model_name='server',
            name='vault',
            field=models.ForeignKey(to='vault.Vault', on_delete=models.CASCADE, related_name='servers'),
        ),
        
        # Remove temporary fields
        migrations.RemoveField(model_name='credential', name='vault_uuid'),
        migrations.RemoveField(model_name='server', name='vault_uuid'),
        migrations.RemoveField(model_name='server', name='credential_uuid'),
        
        # Restore unique_together constraints (they were dropped when fields were removed)
        migrations.AlterUniqueTogether(
            name='credential',
            unique_together={('vault', 'name')},
        ),
        migrations.AlterUniqueTogether(
            name='server',
            unique_together={('vault', 'name')},
        ),
        migrations.AlterUniqueTogether(
            name='vault',
            unique_together={('owner', 'name')},
        ),
    ]
