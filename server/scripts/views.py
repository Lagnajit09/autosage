from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db import transaction
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
import vercel_blob
import logging

# Configure logging
logger = logging.getLogger(__name__)


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
            blob_response = vercel_blob.put(
                path=pathname,
                data=content.encode('utf-8'),
                options={
                    "token": blob_token,
                    "addRandomSuffix": False,  # No Random Suffix
                    "contentType": content_type
                }
            )

            if not blob_response.get('url'):
                logger.error(f"Blob upload failed: {blob_response}")
                return api_response(
                    success=False,
                    message="Failed to upload script to blob storage.",
                    errors={"blob": [f"Upload failed: {blob_response}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # The blob URL from response
            blob_url = blob_response['url']
            download_url = blob_response.get('downloadUrl', blob_url)

            # Create Script record in database
            script = Script.objects.create(
                name=f"{name}.{extension}",
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
            logger.error(f"Blob storage connection error: {str(e)}")
            return api_response(
                success=False,
                message="Failed to connect to blob storage.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error during script creation: {str(e)}")
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
                try:
                    delete_response = vercel_blob.delete(
                        blob_url,
                        options={
                            "token": blob_token,
                        }
                    )
                    
                    # Null checking before accessing status_code
                    if delete_response and hasattr(delete_response, 'status_code'):
                        if delete_response.status_code not in [200, 204]:
                            logger.warning(f"Failed to delete blob: {delete_response}")
                except Exception as blob_error:
                    # Log blob deletion error but continue with database deletion
                    logger.error(f"Error deleting blob: {str(blob_error)}")

            # Delete from database
            script_name = script.name
            script.delete()

            return api_response(
                success=True,
                message=f"Script '{script_name}' deleted successfully.",
                status_code=status.HTTP_200_OK
            )

        except Exception as e:
            logger.error(f"Error deleting script: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptContentView(APIView):
    """
    Retrieve script content from Vercel Blob.
    GET: Fetch and return the actual script content
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Fetch script content from Vercel Blob."""
        # Get the script (must be owned by user)
        script = get_object_or_404(Script, pk=pk, owner=request.user)

        try:
            # Fetch content from blob URL
            url_to_fetch = script.download_url or script.blob_url
            content_response = requests.get(url_to_fetch, timeout=30)

            if content_response.status_code != 200:
                return api_response(
                    success=False,
                    message="Failed to fetch script content from storage.",
                    errors={"blob": [f"Status code: {content_response.status_code}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            content = content_response.text

            # Return content
            return api_response(
                success=True,
                message="Script content retrieved successfully.",
                data={
                    "id": script.id,
                    "name": script.name,
                    "content": content,
                    "content_type": script.content_type,
                    "version": script.version
                },
                status_code=status.HTTP_200_OK
            )

        except requests.exceptions.Timeout:
            return api_response(
                success=False,
                message="Request to fetch script content timed out.",
                errors={"blob": ["Timeout error"]},
                status_code=status.HTTP_504_GATEWAY_TIMEOUT
            )
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching script content: {str(e)}")
            return api_response(
                success=False,
                message="Failed to fetch script content.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error fetching content: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptUpdateView(APIView):
    """
    Update script content.
    POST: Update script content in Vercel Blob
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Update script content."""
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

            pathname = script.pathname

            blob_response = vercel_blob.put(
                path=pathname,
                data=new_content.encode('utf-8'),
                options={
                    "token": blob_token,
                    "allowOverwrite": True,
                    "addRandomSuffix": False,  # No Random Suffix
                    "contentType": script.content_type
                }
            )

            # .get() for safer access and log instead of print
            logger.debug(f"Blob update response: {blob_response}")

            if not blob_response.get('url') or not blob_response.get('downloadUrl'):
                logger.error(f"Blob update failed: {blob_response}")
                return api_response(
                    success=False,
                    message="Failed to upload updated script to blob storage.",
                    errors={"blob": [f"Upload failed: {blob_response}"]},
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # The blob URL from response
            blob_url = blob_response['url']
            download_url = blob_response['downloadUrl']

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
            logger.error(f"Blob storage error during update: {str(e)}")
            return api_response(
                success=False,
                message="Failed to update script in blob storage.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error during update: {str(e)}")
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

        # Atomic transaction to prevent race conditions
        try:
            with transaction.atomic():
                # Check if a script with the new name already exists (with lock)
                if Script.objects.select_for_update().filter(
                    owner=request.user, 
                    pathname=new_pathname
                ).exclude(pk=pk).exists():
                    return api_response(
                        success=False,
                        message=f"A script with the name '{new_name}' already exists.",
                        errors={"new_name": ["Script with this name already exists."]},
                        status_code=status.HTTP_400_BAD_REQUEST
                    )

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
                old_blob_url = script.blob_url

                # Upload with new pathname FIRST, then delete old one
                blob_response = vercel_blob.put(
                    path=new_pathname,
                    data=content.encode('utf-8'),
                    options={
                        "token": blob_token,
                        "addRandomSuffix": False,  # No Random Suffix
                        "contentType": script.content_type
                    }
                )

                if not blob_response.get('url') or not blob_response.get('downloadUrl'):
                    logger.error(f"Blob rename upload failed: {blob_response}")
                    return api_response(
                        success=False,
                        message="Failed to upload renamed script to blob storage.",
                        errors={"blob": [f"Upload failed: {blob_response}"]},
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )

                # The blob URL from response
                blob_url = blob_response['url']
                download_url = blob_response['downloadUrl']

                # Update script record
                old_name = script.name
                script.name = f"{new_name}.{extension}"
                script.pathname = new_pathname
                script.blob_url = blob_url
                script.download_url = download_url
                script.save()

                # Delete old blob AFTER successful upload
                try:
                    delete_response = vercel_blob.delete(
                        old_blob_url,
                        options={
                            "token": blob_token,
                        }
                    )
                    
                    # Log if deletion fails
                    if delete_response and hasattr(delete_response, 'status_code'):
                        if delete_response.status_code not in [200, 204]:
                            logger.warning(f"Failed to delete old blob after rename: {delete_response}")
                except Exception as blob_error:
                    # Log but don't fail the operation since new blob is already created
                    logger.error(f"Error deleting old blob after rename: {str(blob_error)}")

                serializer = ScriptSerializer(script)
                return api_response(
                    success=True,
                    message=f"Script renamed from '{old_name}' to '{new_name}' successfully.",
                    data=serializer.data,
                    status_code=status.HTTP_200_OK
                )

        except requests.exceptions.Timeout:
            return api_response(
                success=False,
                message="Request to blob storage timed out.",
                errors={"blob": ["Timeout error"]},
                status_code=status.HTTP_504_GATEWAY_TIMEOUT
            )
        except requests.exceptions.RequestException as e:
            logger.error(f"Blob storage error during rename: {str(e)}")
            return api_response(
                success=False,
                message="Failed to rename script in blob storage.",
                errors={"blob": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error during rename: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": [str(e)]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )