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

    def test_credential_secrets_masked_in_list(self):
        """SECURITY TEST: Ensure sensitive fields are NOT exposed in list endpoint"""
        Credential.objects.create(
            vault=self.vault, 
            name='My Cred', 
            credential_type='username_password',
            username='admin',
            password='supersecret123'
        )
        
        response = self.client.get(self.cred_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check that sensitive fields are NOT present
        cred_data = response.data['data'][0]
        self.assertNotIn('username', cred_data)
        self.assertNotIn('password', cred_data)
        self.assertNotIn('ssh_key', cred_data)
        self.assertNotIn('key_passphrase', cred_data)
        self.assertNotIn('cert_pem', cred_data)
        
        # But non-sensitive fields should be present
        self.assertIn('name', cred_data)

    def test_credential_secrets_masked_in_detail(self):
        """SECURITY TEST: Ensure sensitive fields are NOT exposed in detail endpoint"""
        cred = Credential.objects.create(
            vault=self.vault, 
            name='My Cred', 
            credential_type='username_password',
            username='admin',
            password='supersecret123'
        )
        
        url = reverse('credential-detail', args=[cred.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check that sensitive fields are NOT present
        cred_data = response.data['data']
        self.assertNotIn('username', cred_data)
        self.assertNotIn('password', cred_data)
        self.assertNotIn('ssh_key', cred_data)

    def test_credential_reveal_exposes_secrets(self):
        """SECURITY TEST: Ensure reveal endpoint DOES expose sensitive fields"""
        cred = Credential.objects.create(
            vault=self.vault, 
            name='My Cred', 
            credential_type='username_password',
            username='admin',
            password='supersecret123'
        )
        
        url = reverse('credential-reveal', args=[cred.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check that ALL fields including sensitive ones ARE present
        cred_data = response.data['data']
        self.assertIn('password', cred_data)
        self.assertEqual(cred_data['password'], 'supersecret123')
        self.assertIn('username', cred_data)

    def test_credential_reveal_blocked_for_other_users(self):
        """SECURITY TEST: Ensure users cannot reveal secrets for other users' credentials"""
        cred = Credential.objects.create(
            vault=self.other_vault, 
            name='Other Cred', 
            credential_type='username_password',
            username='admin',
            password='othersecret'
        )
        
        url = reverse('credential-reveal', args=[cred.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

class ServerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.user2 = User.objects.create_user(username='otheruser', password='testpassword')
        self.client.force_authenticate(user=self.user)
        self.vault = Vault.objects.create(name='My Vault', owner=self.user)
        self.vault2 = Vault.objects.create(name='My Vault 2', owner=self.user)
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

    def test_partial_update_credential_name_only(self):
        """Verify that updating ONLY the name of a credential works (PATCH)."""
        cred = Credential.objects.create(
            vault=self.vault, 
            name='Old Name', 
            credential_type='username_password',
            username='admin',
            password='password123'
        )
        url = reverse('credential-detail', args=[cred.id])
        data = {'name': 'New Name'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cred.refresh_from_db()
        self.assertEqual(cred.name, 'New Name')

    def test_move_credential_to_another_vault(self):
        """Verify the move-to-vault endpoint."""
        new_vault = Vault.objects.create(name='Secondary Vault', owner=self.user)
        cred = Credential.objects.create(vault=self.vault, name='Move Me', credential_type='username_password')
        url = reverse('credential-move-to-vault', args=[cred.id])
        data = {'vault_id': new_vault.id}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cred.refresh_from_db()
        self.assertEqual(cred.vault, new_vault)

    def test_partial_update_server_name_only(self):
        """Verify that updating ONLY the name of a server works (PATCH)."""
        server = Server.objects.create(vault=self.vault, name='Old Server', host='1.1.1.1', connection_method='ssh')
        url = reverse('server-detail', args=[server.id])
        data = {'name': 'New Server'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        server.refresh_from_db()
        self.assertEqual(server.name, 'New Server')

    def test_link_credential_to_server(self):
        """Verify the link-credential endpoint."""
        server = Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh')
        url = reverse('server-link-credential', args=[server.id])
        data = {'credential_id': self.cred.id}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        server.refresh_from_db()
        self.assertEqual(server.credential, self.cred)

    def test_unlink_credential_from_server(self):
        """Verify the unlink-credential endpoint."""
        server = Server.objects.create(vault=self.vault, name='My Server', host='1.1.1.1', connection_method='ssh', credential=self.cred)
        url = reverse('server-unlink-credential', args=[server.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        server.refresh_from_db()
        self.assertIsNone(server.credential)

    def test_link_credential_mismatched_vault_blocked(self):
        """SECURITY TEST: Ensure credentials from different vaults cannot be linked to a server."""
        # Create a credential in vault2
        cred2 = Credential.objects.create(vault=self.vault2, name='Cred in Vault 2', credential_type='username_password')
        # Create a server in vault1
        server = Server.objects.create(vault=self.vault, name='Server in Vault 1', host='1.1.1.1', connection_method='ssh')
        
        url = reverse('server-link-credential', args=[server.id])
        data = {'credential_id': cred2.id}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must belong to the same vault", response.data['message'])

    def test_create_server_mismatched_vault_credential_blocked(self):
        """SECURITY TEST: Ensure servers cannot be created with a credential from a different vault."""
        cred2 = Credential.objects.create(vault=self.vault2, name='Cred in Vault 2', credential_type='username_password')
        
        data = {
            'vault': self.vault.id, # Vault 1
            'name': 'Server',
            'host': '1.1.1.1',
            'connection_method': 'ssh',
            'credential': cred2.id # Cred from Vault 2
        }
        response = self.client.post(self.server_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must belong to the same vault", str(response.data))
