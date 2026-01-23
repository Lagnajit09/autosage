from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from .models import Vault

User = get_user_model()

class VaultTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.user2 = User.objects.create_user(username='otheruser', password='testpassword')
        self.client.force_authenticate(user=self.user)
        self.vault_url = reverse('vault-list-create')

    def test_create_vault(self):
        """
        Ensure we can create a new vault object.
        """
        data = {'name': 'My Vault', 'description': 'A test vault'}
        response = self.client.post(self.vault_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Vault.objects.count(), 1)
        self.assertEqual(Vault.objects.get().name, 'My Vault')
        self.assertEqual(Vault.objects.get().owner, self.user)

    def test_list_vaults(self):
        """
        Ensure we can list only our own vaults.
        """
        Vault.objects.create(name='Vault 1', owner=self.user)
        Vault.objects.create(name='Vault 2', owner=self.user2)
        
        response = self.client.get(self.vault_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Vault 1')

    def test_retrieve_vault(self):
        """
        Ensure we can retrieve a specific vault.
        """
        vault = Vault.objects.create(name='Vault 1', owner=self.user)
        url = reverse('vault-detail', args=[vault.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Vault 1')

    def test_update_vault(self):
        """
        Ensure we can update a vault.
        """
        vault = Vault.objects.create(name='Vault 1', owner=self.user)
        url = reverse('vault-detail', args=[vault.id])
        data = {'name': 'Updated Vault', 'description': 'Updated description'}
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Vault.objects.get().name, 'Updated Vault')

    def test_delete_vault(self):
        """
        Ensure we can delete a vault.
        """
        vault = Vault.objects.create(name='Vault 1', owner=self.user)
        url = reverse('vault-detail', args=[vault.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Vault.objects.count(), 0)

    def test_access_denied_other_user_vault(self):
        """
        Ensure we cannot access another user's vault.
        """
        vault = Vault.objects.create(name='Other Vault', owner=self.user2)
        url = reverse('vault-detail', args=[vault.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_access(self):
        """
        Ensure unauthenticated users cannot access the API.
        """
        self.client.force_authenticate(user=None)
        response = self.client.get(self.vault_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
