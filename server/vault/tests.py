from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from .models import Vault, Credential, Server

User = get_user_model()

class VaultTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.user2 = User.objects.create_user(username='otheruser', password='testpassword')
        self.client.force_authenticate(user=self.user)
        self.vault_url = reverse('vault-list-create')

    def test_create_vault(self):
        data = {'name': 'My Vault', 'description': 'A test vault'}
        response = self.client.post(self.vault_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'success')
        self.assertEqual(Vault.objects.count(), 1)
        self.assertEqual(response.data['data']['name'], 'My Vault')

    def test_list_vaults(self):
        Vault.objects.create(name='Vault 1', owner=self.user)
        Vault.objects.create(name='Vault 2', owner=self.user2)
        
        response = self.client.get(self.vault_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['name'], 'Vault 1')

    def test_retrieve_vault(self):
        vault = Vault.objects.create(name='Vault 1', owner=self.user)
        url = reverse('vault-detail', args=[vault.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['name'], 'Vault 1')

class CredentialTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.user2 = User.objects.create_user(username='otheruser', password='testpassword')
        self.client.force_authenticate(user=self.user)
        self.vault = Vault.objects.create(name='My Vault', owner=self.user)
        self.other_vault = Vault.objects.create(name='Other Vault', owner=self.user2)
        self.cred_url = reverse('credential-list-create')

    def test_create_credential_success(self):
        data = {
            'vault': self.vault.id,
            'name': 'My Login',
            'credential_type': 'username_password',
            'username': 'admin',
            'password': 'password123'
        }
        response = self.client.post(self.cred_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Credential.objects.count(), 1)
        self.assertEqual(Credential.objects.get().name, 'My Login')

    def test_create_credential_invalid_type_missing_fields(self):
        data = {
            'vault': self.vault.id,
            'name': 'My Login',
            'credential_type': 'username_password',
        }
        response = self.client.post(self.cred_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_credential_wrong_vault_owner(self):
        data = {
            'vault': self.other_vault.id,
            'name': 'Hack',
            'credential_type': 'username_password',
            'username': 'admin',
            'password': 'password123'
        }
        response = self.client.post(self.cred_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_credentials_only_own(self):
        Credential.objects.create(vault=self.vault, name='My Cred', credential_type='username_password')
        Credential.objects.create(vault=self.other_vault, name='Other Cred', credential_type='username_password')
        
        response = self.client.get(self.cred_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['name'], 'My Cred')

    def test_list_credentials_filter_by_other_vault_blocked(self):
        """SECURITY TEST: Ensure users cannot filter by other users' vault_id"""
        Credential.objects.create(vault=self.vault, name='My Cred', credential_type='username_password')
        Credential.objects.create(vault=self.other_vault, name='Other Cred', credential_type='username_password')
        
        # Try to filter by another user's vault
        response = self.client.get(f'{self.cred_url}?vault_id={self.other_vault.id}')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_credential_to_other_vault_blocked(self):
        """SECURITY TEST: Ensure users cannot move credentials to other users' vaults"""
        cred = Credential.objects.create(vault=self.vault, name='My Cred', credential_type='username_password')
        url = reverse('credential-detail', args=[cred.id])
        
        data = {'vault': self.other_vault.id}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

class ServerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.user2 = User.objects.create_user(username='otheruser', password='testpassword')
        self.client.force_authenticate(user=self.user)
        self.vault = Vault.objects.create(name='My Vault', owner=self.user)
        self.other_vault = Vault.objects.create(name='Other Vault', owner=self.user2)
        self.cred = Credential.objects.create(vault=self.vault, name='My Cred', credential_type='username_password')
        self.other_cred = Credential.objects.create(vault=self.other_vault, name='Other Cred', credential_type='username_password')
        self.server_url = reverse('server-list-create')

    def test_create_server_success(self):
        data = {
            'vault': self.vault.id,
            'name': 'My Server',
            'host': '192.168.1.1',
            'connection_method': 'ssh',
            'credential': self.cred.id
        }
        response = self.client.post(self.server_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Server.objects.count(), 1)
        self.assertEqual(Server.objects.get().name, 'My Server')

    def test_create_server_wrong_vault_owner(self):
        data = {
            'vault': self.other_vault.id,
            'name': 'My Server',
            'host': '192.168.1.1',
            'connection_method': 'ssh'
        }
        response = self.client.post(self.server_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_server_wrong_credential_owner(self):
        data = {
            'vault': self.vault.id,
            'name': 'My Server',
            'host': '192.168.1.1',
            'connection_method': 'ssh',
            'credential': self.other_cred.id
        }
        response = self.client.post(self.server_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_servers_only_own(self):
        Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh')
        Server.objects.create(vault=self.other_vault, name='Other Server', host='2.2.2.2', connection_method='ssh')
        
        response = self.client.get(self.server_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['name'], 'My Server')

    def test_list_servers_filter_by_other_vault_blocked(self):
        """SECURITY TEST: Ensure users cannot filter by other users' vault_id"""
        Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh')
        Server.objects.create(vault=self.other_vault, name='Other Server', host='2.2.2.2', connection_method='ssh')
        
        # Try to filter by another user's vault
        response = self.client.get(f'{self.server_url}?vault_id={self.other_vault.id}')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_server_port_validation(self):
        server = Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh')
        url = reverse('server-detail', args=[server.id])
        data = {'port': 70000}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('port', response.data['errors'])

    def test_update_server_to_other_vault_blocked(self):
        """SECURITY TEST: Ensure users cannot move servers to other users' vaults"""
        server = Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh')
        url = reverse('server-detail', args=[server.id])
        
        data = {'vault': self.other_vault.id}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_server_with_other_credential_blocked(self):
        """SECURITY TEST: Ensure users cannot assign other users' credentials to servers"""
        server = Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh')
        url = reverse('server-detail', args=[server.id])
        
        data = {'credential': self.other_cred.id}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
