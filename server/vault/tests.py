from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from .models import Vault, Credential

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
        # Check standard response format
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
            # missing username/password
        }
        response = self.client.post(self.cred_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_credential_wrong_vault_owner(self):
        # User 1 tries to add credential to User 2's vault
        data = {
            'vault': self.other_vault.id,
            'name': 'Hack',
            'credential_type': 'username_password',
            'username': 'admin',
            'password': 'password123'
        }
        response = self.client.post(self.cred_url, data, format='json')
        # Should be forbidden or bad request depending on implementation
        # In my perform_create, I raise PermissionDenied
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_credentials_only_own(self):
        Credential.objects.create(vault=self.vault, name='My Cred', credential_type='username_password')
        Credential.objects.create(vault=self.other_vault, name='Other Cred', credential_type='username_password')
        
        response = self.client.get(self.cred_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['name'], 'My Cred')

    def test_update_credential_change_vault_restricted(self):
        cred = Credential.objects.create(vault=self.vault, name='My Cred', credential_type='username_password')
        url = reverse('credential-detail', args=[cred.id])
        data = {
            'vault': self.other_vault.id, # Try to move to someone else's vault
            'name': 'Updated'
        }
        response = self.client.patch(url, data, format='json')
        # Should be 404 because get_object_or_404(Vault, owner=self.request.user)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
