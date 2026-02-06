from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError, PermissionDenied
from .models import Script
from .serializers import (
    ScriptSerializer,
    ScriptCreateSerializer,
    ScriptUpdateSerializer,
    ScriptRenameSerializer,
    ScriptContentSerializer
)
from server.utils import api_response
import requests
import json


class ScriptListCreateView(generics.ListCreateAPIView):
    """
    List all scripts owned by the user or create a new script.
    POST: Create a new script with content uploaded to Vercel Blob
    GET: List all scripts owned by the user
    """
    serializer_class = ScriptSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return only scripts owned by the authenticated user."""
        return Script.objects.filter(owner=self.request.user)

    def list(self, request, *args, **kwargs):
        """List all scripts with standardized response."""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return api_response(
            success=True,
            message="Scripts retrieved successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )

    def create(self, request, *args, **kwargs):
        """
        Create a new script and upload content to Vercel Blob.
        Expected payload: {name, language, content}
        """
        # Validate input data
        create_serializer = ScriptCreateSerializer(data=request.data)
        if not create_serializer.is_valid():
            return api_response(
                success=False,
                message="Validation failed.",
                errors=create_serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        validated_data = create_serializer.validated_data
        name = validated_data['name']
        language = validated_data['language']
        content = validated_data['content']

        # Get language mapping
        lang_info = ScriptCreateSerializer.LANGUAGE_MAP[language]
        extension = lang_info['ext']
        content_type = lang_info['content_type']

        # Create pathname
        pathname = f"scripts/{name}.{extension}"

        # Check if script with same pathname already exists for this user
        if Script.objects.filter(owner=request.user, pathname=pathname).exists():
            return api_response(
                success=False,
                message=f"A script with the name '{name}' already exists.",
                errors={"name": ["Script with this name already exists."]},
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # Upload to Vercel Blob
        try:
            blob_token = settings.VERCEL_BLOB_TOKEN
            if not blob_token:
                return api_response(
                    success=False,
                    message="Vercel Blob token not configured.",
                    errors={"server": ["Blob storage is not configured properly."]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Upload file to Vercel Blob using PUT request
            # Vercel Blob API expects: PUT to base_url with pathname and content
            base_url = "https://blob.vercel-storage.com"  # API host
            pathname = f"scripts/{name}.{extension}"
            upload_url = f"{base_url}/{pathname}"
            headers = {
                "Authorization": f"Bearer {blob_token}",
                "x-content-type": content_type,
            }

            response = requests.put(
                upload_url,
                headers=headers,
                data=content.encode('utf-8'),
                timeout=30
            )

            if response.status_code not in [200, 201]:
                return api_response(
                    success=False,
                    message="Failed to upload script to blob storage.",
                    errors={"blob": [f"Upload failed: {response.text}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # The blob URL from response
            blob_data = response.json()
            blob_url = blob_data['url']
            download_url = blob_data['url']

            # Create Script record in database
            script = Script.objects.create(
                name=name,
                pathname=pathname,
                blob_url=blob_url,
                download_url=download_url,
                owner=request.user,
                content_type=content_type,
                file_size=len(content.encode('utf-8')),
                version=1
            )

            serializer = ScriptSerializer(script)
            return api_response(
                success=True,
                message="Script created successfully.",
                data=serializer.data,
                status_code=status.HTTP_201_CREATED
            )

        except requests.exceptions.RequestException as e:
            return api_response(
                success=False,
                message="Failed to connect to blob storage.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptDetailView(generics.RetrieveDestroyAPIView):
    """
    Retrieve or delete a script instance.
    GET: Retrieve script metadata
    DELETE: Delete script from both database and Vercel Blob
    """
    serializer_class = ScriptSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return only scripts owned by the authenticated user."""
        return Script.objects.filter(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve script metadata with standardized response."""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return api_response(
            success=True,
            message="Script retrieved successfully.",
            data=serializer.data,
            status_code=status.HTTP_200_OK
        )

    def destroy(self, request, *args, **kwargs):
        """
        Delete script from both database and Vercel Blob storage.
        """
        script = self.get_object()
        blob_url = script.blob_url

        try:
            # Delete from Vercel Blob
            blob_token = settings.VERCEL_BLOB_TOKEN
            if blob_token and blob_url:
                headers = {
                    "Authorization": f"Bearer {blob_token}",
                }
                
                # Vercel Blob delete endpoint - DELETE to the blob URL
                delete_response = requests.delete(
                    blob_url,
                    headers=headers,
                    timeout=30
                )
                
                # Log if deletion from blob failed, but continue with DB deletion
                if delete_response.status_code not in [200, 204]:
                    print(f"Warning: Failed to delete blob: {delete_response.text}")

            # Delete from database
            script_name = script.name
            script.delete()

            return api_response(
                success=True,
                message=f"Script '{script_name}' deleted successfully.",
                status_code=status.HTTP_200_OK
            )

        except requests.exceptions.RequestException as e:
            # Even if blob deletion fails, delete from database
            script_name = script.name
            script.delete()
            return api_response(
                success=True,
                message=f"Script '{script_name}' deleted from database. Blob deletion may have failed.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_200_OK
            )
        except Exception as e:
            return api_response(
                success=False,
                message="Failed to delete script.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptContentView(APIView):
    """
    Retrieve the actual content of a script from Vercel Blob.
    GET: Fetch and return script content
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Fetch script content from Vercel Blob."""
        # Get the script (must be owned by user)
        script = get_object_or_404(Script, pk=pk, owner=request.user)

        try:
            # Fetch content from Vercel Blob
            response = requests.get(script.download_url or script.blob_url, timeout=30)
            
            if response.status_code != 200:
                return api_response(
                    success=False,
                    message="Failed to fetch script content from blob storage.",
                    errors={"blob": [f"Fetch failed with status {response.status_code}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            content = response.text

            # Extract language from pathname
            extension = script.pathname.split('.')[-1]
            language_map_reverse = {
                v['ext']: k for k, v in ScriptCreateSerializer.LANGUAGE_MAP.items()
            }
            language = language_map_reverse.get(extension, 'text')

            # Prepare response data
            content_data = {
                'name': script.name,
                'pathname': script.pathname,
                'content': content,
                'language': language,
                'content_type': script.content_type,
                'file_size': script.file_size,
                'version': script.version,
                'uploaded_at': script.uploaded_at,
                'updated_at': script.updated_at,
            }

            serializer = ScriptContentSerializer(content_data)
            return api_response(
                success=True,
                message="Script content retrieved successfully.",
                data=serializer.data,
                status_code=status.HTTP_200_OK
            )

        except requests.exceptions.RequestException as e:
            return api_response(
                success=False,
                message="Failed to fetch script content.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptUpdateView(APIView):
    """
    Update the content of an existing script.
    PUT: Update script content in Vercel Blob and increment version
    """
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        """Update script content and increment version."""
        # Get the script (must be owned by user)
        script = get_object_or_404(Script, pk=pk, owner=request.user)

        # Validate input data
        update_serializer = ScriptUpdateSerializer(data=request.data)
        if not update_serializer.is_valid():
            return api_response(
                success=False,
                message="Validation failed.",
                errors=update_serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        new_content = update_serializer.validated_data['content']

        try:
            blob_token = settings.VERCEL_BLOB_TOKEN
            if not blob_token:
                return api_response(
                    success=False,
                    message="Vercel Blob token not configured.",
                    errors={"server": ["Blob storage is not configured properly."]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Delete old blob
            if script.blob_url:
                delete_response = requests.delete(
                    script.blob_url,
                    headers={"Authorization": f"Bearer {blob_token}"},
                    timeout=30
                )
                # Log if deletion fails but continue
                if delete_response.status_code not in [200, 204]:
                    print(f"Warning: Failed to delete old blob: {delete_response.text}")

            # Upload new content using PUT request
            base_url = "https://blob.vercel-storage.com"  # API host
            pathname = f"/{script.pathname}"
            upload_url = f"{base_url}/{pathname}"
            headers = {
                "Authorization": f"Bearer {blob_token}",
                "x-content-type": script.content_type,
            }

            response = requests.put(
                upload_url,
                headers=headers,
                data=new_content.encode('utf-8'),
                timeout=30
            )

            if response.status_code not in [200, 201]:
                return api_response(
                    success=False,
                    message="Failed to upload updated script to blob storage.",
                    errors={"blob": [f"Upload failed: {response.text}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # The blob URL from response
            blob_data = response.json()
            blob_url = blob_data['url']
            download_url = blob_data['url']

            # Update script record
            script.blob_url = blob_url
            script.download_url = download_url
            script.file_size = len(new_content.encode('utf-8'))
            script.version += 1
            script.save()

            serializer = ScriptSerializer(script)
            return api_response(
                success=True,
                message=f"Script updated successfully to version {script.version}.",
                data=serializer.data,
                status_code=status.HTTP_200_OK
            )

        except requests.exceptions.RequestException as e:
            return api_response(
                success=False,
                message="Failed to update script in blob storage.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptRenameView(APIView):
    """
    Rename a script.
    POST: Rename script and update pathname in Vercel Blob
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Rename a script."""
        # Get the script (must be owned by user)
        script = get_object_or_404(Script, pk=pk, owner=request.user)

        # Validate input data
        rename_serializer = ScriptRenameSerializer(data=request.data)
        if not rename_serializer.is_valid():
            return api_response(
                success=False,
                message="Validation failed.",
                errors=rename_serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        new_name = rename_serializer.validated_data['new_name']
        
        # Extract extension from current pathname
        extension = script.pathname.split('.')[-1]
        new_pathname = f"scripts/{new_name}.{extension}"

        # Check if a script with the new name already exists
        if Script.objects.filter(owner=request.user, pathname=new_pathname).exclude(pk=pk).exists():
            return api_response(
                success=False,
                message=f"A script with the name '{new_name}' already exists.",
                errors={"new_name": ["Script with this name already exists."]},
                status_code=status.HTTP_400_BAD_REQUEST
            )

        try:
            blob_token = settings.VERCEL_BLOB_TOKEN
            if not blob_token:
                return api_response(
                    success=False,
                    message="Vercel Blob token not configured.",
                    errors={"server": ["Blob storage is not configured properly."]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Fetch current content
            content_response = requests.get(script.download_url or script.blob_url, timeout=30)
            if content_response.status_code != 200:
                return api_response(
                    success=False,
                    message="Failed to fetch current script content.",
                    errors={"blob": ["Could not retrieve current content."]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            content = content_response.text

            # Delete old blob
            delete_response = requests.delete(
                script.blob_url,
                headers={"Authorization": f"Bearer {blob_token}"},
                timeout=30
            )
            
            # Upload with new pathname using PUT request
            base_url = "https://blob.vercel-storage.com"  # API host
            pathname = f"scripts/{new_name}.{extension}"
            upload_url = f"{base_url}/{pathname}"
            headers = {
                "Authorization": f"Bearer {blob_token}",
                "x-content-type": script.content_type,
            }

            response = requests.put(
                upload_url,
                headers=headers,
                data=content.encode('utf-8'),
                timeout=30
            )

            if response.status_code not in [200, 201]:
                return api_response(
                    success=False,
                    message="Failed to upload renamed script to blob storage.",
                    errors={"blob": [f"Upload failed: {response.text}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # The blob URL from response
            blob_data = response.json()
            blob_url = blob_data['url']
            download_url = blob_data['url']

            # Update script record
            old_name = script.name
            script.name = new_name
            script.pathname = new_pathname
            script.blob_url = blob_url
            script.download_url = download_url
            script.save()

            serializer = ScriptSerializer(script)
            return api_response(
                success=True,
                message=f"Script renamed from '{old_name}' to '{new_name}' successfully.",
                data=serializer.data,
                status_code=status.HTTP_200_OK
            )

        except requests.exceptions.RequestException as e:
            return api_response(
                success=False,
                message="Failed to rename script in blob storage.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )