from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db import transaction
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError, PermissionDenied
from scripts.models import Script
from scripts.serializers import (
    ScriptSerializer,
    ScriptCreateSerializer,
    ScriptUpdateSerializer,
    ScriptRenameSerializer,
)
from server.utils import api_response
from server.rate_limiters import ScriptBurstThrottle, ScriptSustainedThrottle, ScriptCreateThrottle
from scripts.gcs import (
    build_blob_path,
    upload_script,
    download_script,
    delete_script,
    copy_script,
)
from google.cloud.exceptions import GoogleCloudError
from google.api_core.exceptions import NotFound
import logging

# Configure logging
logger = logging.getLogger(__name__)


class ScriptListCreateView(generics.ListCreateAPIView):
    """
    List all scripts owned by the user or create a new script.
    POST: Create a new script with content uploaded to Google Cloud Storage
    GET: List all scripts owned by the user
    """
    serializer_class = ScriptSerializer
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == 'POST':
            return [ScriptBurstThrottle(), ScriptSustainedThrottle(), ScriptCreateThrottle()]
        return [ScriptBurstThrottle(), ScriptSustainedThrottle()]

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
        Create a new script and upload content to Google Cloud Storage.
        Expected payload: {name, language, content}

        GCS path: scripts/<user_id>/<script_id>/<name>.<ext>
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
        filename = f"{name}.{extension}"

        # pathname is user-scoped; the full GCS path is built after we have a DB id
        pathname = f"scripts/{name}.{extension}"

        # Check if script with same pathname already exists for this user
        if Script.objects.filter(owner=request.user, pathname=pathname).exists():
            return api_response(
                success=False,
                message=f"A script with the name '{name}' already exists.",
                errors={"name": ["Script with this name already exists."]},
                status_code=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # Create the DB record first so we have the script ID for the GCS path
                script = Script.objects.create(
                    name=filename,
                    pathname=pathname,
                    blob_url="",          # filled in after upload
                    download_url="",
                    owner=request.user,
                    content_type=content_type,
                    file_size=len(content.encode('utf-8')),
                    version=1
                )

                # Build GCS path: scripts/<user_id>/<script_id>/<filename>
                blob_path = build_blob_path(request.user.id, script.id, filename)

                # Upload to GCS
                gcs_url = upload_script(
                    blob_path=blob_path,
                    content=content.encode('utf-8'),
                    content_type=content_type,
                )

                # Update the script record with the real GCS URL
                script.blob_url = gcs_url
                script.download_url = gcs_url
                script.save(update_fields=['blob_url', 'download_url'])

            serializer = ScriptSerializer(script)
            return api_response(
                success=True,
                message="Script created successfully.",
                data=serializer.data,
                status_code=status.HTTP_201_CREATED
            )

        except GoogleCloudError as e:
            logger.error(f"GCS upload error during script creation: {str(e)}")
            return api_response(
                success=False,
                message="Failed to upload script to cloud storage.",
                errors={"storage": ["GCS service error. Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error during script creation: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": ["Internal server error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptDetailView(generics.RetrieveDestroyAPIView):
    """
    Retrieve or delete a script instance.
    GET: Retrieve script metadata
    DELETE: Delete script from both database and Google Cloud Storage
    """
    serializer_class = ScriptSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScriptBurstThrottle, ScriptSustainedThrottle]

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
        Delete script from both database and Google Cloud Storage.
        """
        script = self.get_object()
        blob_path = build_blob_path(request.user.id, script.id, script.name)

        try:
            # Delete from GCS (non-fatal if already gone)
            try:
                delete_script(blob_path)
            except GoogleCloudError as gcs_error:
                logger.error(f"GCS error deleting blob {blob_path}: {str(gcs_error)}")
                # Continue to remove the DB record regardless

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
                errors={"server": ["Failed to delete script record."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptContentView(APIView):
    """
    Retrieve script content from Google Cloud Storage.
    GET: Fetch and return the actual script content
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScriptBurstThrottle, ScriptSustainedThrottle]

    def get(self, request, pk):
        """Fetch script content from GCS."""
        script = get_object_or_404(Script, pk=pk, owner=request.user)
        blob_path = build_blob_path(request.user.id, script.id, script.name)

        try:
            content = download_script(blob_path)

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

        except NotFound:
            return api_response(
                success=False,
                message="Script file not found in storage.",
                errors={"storage": ["The script file could not be located in GCS."]},
                status_code=status.HTTP_404_NOT_FOUND
            )
        except GoogleCloudError as e:
            logger.error(f"GCS error fetching script content for pk={pk}: {str(e)}")
            return api_response(
                success=False,
                message="Failed to fetch script content from storage.",
                errors={"storage": ["GCS service error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error fetching content for pk={pk}: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": ["Internal server error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptUpdateView(APIView):
    """
    Update script content.
    POST: Overwrite script content in Google Cloud Storage
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScriptBurstThrottle, ScriptSustainedThrottle]

    def post(self, request, pk):
        """Update script content."""
        script = get_object_or_404(Script, pk=pk, owner=request.user)

        update_serializer = ScriptUpdateSerializer(data=request.data)
        if not update_serializer.is_valid():
            return api_response(
                success=False,
                message="Validation failed.",
                errors=update_serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        new_content = update_serializer.validated_data['content']
        blob_path = build_blob_path(request.user.id, script.id, script.name)

        try:
            # Overwrite existing blob in GCS
            gcs_url = upload_script(
                blob_path=blob_path,
                content=new_content.encode('utf-8'),
                content_type=script.content_type,
            )

            # Update script record
            script.blob_url = gcs_url
            script.download_url = gcs_url
            script.file_size = len(new_content.encode('utf-8'))
            script.version += 1
            script.save(update_fields=['blob_url', 'download_url', 'file_size', 'version'])

            serializer = ScriptSerializer(script)
            return api_response(
                success=True,
                message=f"Script updated successfully to version {script.version}.",
                data=serializer.data,
                status_code=status.HTTP_200_OK
            )

        except GoogleCloudError as e:
            logger.error(f"GCS error during script update for pk={pk}: {str(e)}")
            return api_response(
                success=False,
                message="Failed to update script in cloud storage.",
                errors={"storage": ["GCS service error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error during script update for pk={pk}: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": ["Internal server error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ScriptRenameView(APIView):
    """
    Rename a script.
    POST: Rename script — server-side GCS copy to new path, then delete old blob.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScriptBurstThrottle, ScriptSustainedThrottle]

    def post(self, request, pk):
        """Rename a script."""
        script = get_object_or_404(Script, pk=pk, owner=request.user)

        rename_serializer = ScriptRenameSerializer(data=request.data)
        if not rename_serializer.is_valid():
            return api_response(
                success=False,
                message="Validation failed.",
                errors=rename_serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        new_name = rename_serializer.validated_data['new_name']

        # Preserve extension from current script name
        extension = script.name.rsplit('.', 1)[-1]
        new_filename = f"{new_name}.{extension}"
        new_pathname = f"scripts/{new_name}.{extension}"

        try:
            with transaction.atomic():
                # Check for name collision (with row lock)
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

                old_blob_path = build_blob_path(request.user.id, script.id, script.name)
                new_blob_path = build_blob_path(request.user.id, script.id, new_filename)

                # Server-side copy to the new path
                new_gcs_url = copy_script(old_blob_path, new_blob_path)

                # Update DB record
                old_name = script.name
                script.name = new_filename
                script.pathname = new_pathname
                script.blob_url = new_gcs_url
                script.download_url = new_gcs_url
                script.save(update_fields=['name', 'pathname', 'blob_url', 'download_url'])

                # Delete old blob after successful copy + DB update
                try:
                    delete_script(old_blob_path)
                except GoogleCloudError as gcs_error:
                    # Non-fatal: new blob and DB are already consistent
                    logger.error(f"Failed to delete old GCS blob after rename: {str(gcs_error)}")

                serializer = ScriptSerializer(script)
                return api_response(
                    success=True,
                    message=f"Script renamed from '{old_name}' to '{new_filename}' successfully.",
                    data=serializer.data,
                    status_code=status.HTTP_200_OK
                )

        except GoogleCloudError as e:
            logger.error(f"GCS error during script rename for pk={pk}: {str(e)}")
            return api_response(
                success=False,
                message="Failed to rename script in cloud storage.",
                errors={"storage": ["GCS service error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Unexpected error during rename for pk={pk}: {str(e)}")
            return api_response(
                success=False,
                message="An unexpected error occurred.",
                errors={"server": ["Internal server error."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )