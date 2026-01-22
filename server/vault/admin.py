from django.contrib import admin
from .models import Credential, Server

@admin.register(Credential)
class CredentialAdmin(admin.ModelAdmin):
    list_display = ('name', 'credential_type', 'vault', 'created_at')
    list_filter = ('credential_type', 'vault')
    search_fields = ('name', 'username')

@admin.register(Server)
class ServerAdmin(admin.ModelAdmin):
    list_display = ('name', 'host', 'connection_method', 'credential', 'vault', 'created_at')
    list_filter = ('connection_method', 'vault')
    search_fields = ('name', 'host')
