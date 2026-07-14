import logging

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from google.cloud.exceptions import GoogleCloudError

from billing.enforcement import PlanLimitExceeded
from billing.limits import get_limits, get_plan
from scripts.gcs import build_blob_path, copy_script
from scripts.models import Script
from server.rate_limiters import (
    LibraryBurstThrottle,
    LibraryForkThrottle,
    LibrarySustainedThrottle,
)
from server.utils import api_response
from workflows.models import Workflow

from .models import LibraryItem
from .serializers import LibraryItemDetailSerializer, LibraryItemListSerializer

logger = logging.getLogger(__name__)


class LibraryListView(generics.ListAPIView):
    """
    Browse published library items.

    Supports filtering via query params:
        ?type=workflow|node|script|module
        ?category=<category>
        ?search=<term>   (matches name / description)
    """
    serializer_class = LibraryItemListSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [LibraryBurstThrottle, LibrarySustainedThrottle]

    def get_queryset(self):
        qs = LibraryItem.objects.filter(is_published=True)

        item_type = self.request.query_params.get('type')
        if item_type:
            qs = qs.filter(type=item_type)

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(description__icontains=search)

        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Library items retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK,
        )


class LibraryDetailView(generics.RetrieveAPIView):
    """Retrieve a single library item including its ``content``."""
    serializer_class = LibraryItemDetailSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [LibraryBurstThrottle, LibrarySustainedThrottle]

    def get_queryset(self):
        return LibraryItem.objects.filter(is_published=True)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Library item retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK,
        )


class LibraryForkView(APIView):
    """
    Fork a library item into the requesting user's account.

    The fork behaviour depends on ``item.type``:
        workflow -> create a new user-owned Workflow (vault bindings stripped)
        script   -> copy the shared library script into the user's scripts
        node     -> return the NodeData payload for the client to inject
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [LibraryBurstThrottle, LibrarySustainedThrottle, LibraryForkThrottle]

    def post(self, request, pk):
        item = get_object_or_404(LibraryItem, pk=pk, is_published=True)

        if item.type == LibraryItem.ItemType.WORKFLOW:
            data = self._fork_workflow(request, item)
        elif item.type == LibraryItem.ItemType.SCRIPT:
            data = self._fork_script(request, item)
        elif item.type == LibraryItem.ItemType.NODE:
            data = self._fork_node(item)
        else:
            return api_response(
                success=False,
                message=f"Forking is not supported for '{item.type}' items yet.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if data is None:
            # A branch already returned its own error Response.
            return self._last_error

        # Best-effort download counter; never block the fork on this.
        LibraryItem.objects.filter(pk=item.pk).update(downloads=F('downloads') + 1)

        return api_response(
            success=True,
            message="Forked successfully.",
            data=data,
            status_code=status.HTTP_201_CREATED,
        )

    # ------------------------------------------------------------------ #
    # Type-specific fork handlers
    # ------------------------------------------------------------------ #

    def _enforce_limit(self, user, limit_key, count_fn):
        """Inline plan-limit check mirroring scripts.views (staff bypass)."""
        if user.is_staff:
            return
        limits = get_limits(user)
        cap = limits.get(limit_key)
        if cap is not None:
            current = count_fn(user)
            if current >= cap:
                raise PlanLimitExceeded(limit_key, current, cap, get_plan(user))

    def _fork_workflow(self, request, item):
        user = request.user
        self._enforce_limit(
            user, 'max_workflows',
            lambda u: Workflow.objects.filter(user=u).count(),
        )

        content = item.content or {}
        nodes = content.get('nodes', []) or []
        edges = content.get('edges', []) or []

        # Library workflows carry no vault credentials — strip any that slipped
        # in so the user configures their own binding after forking.
        for node in nodes:
            node_data = node.get('data')
            if isinstance(node_data, dict):
                node_data.pop('vaultDetails', None)

        workflow = Workflow.objects.create(
            user=user,
            name=item.name,
            description=item.description or "",
            nodes=nodes,
            edges=edges,
        )
        return {
            "type": "workflow",
            "id": str(workflow.id),
            "redirect_url": f"/workflow/{workflow.id}",
        }

    def _fork_script(self, request, item):
        user = request.user
        self._enforce_limit(
            user, 'max_scripts',
            lambda u: Script.objects.filter(owner=u).count(),
        )

        script_id = (item.content or {}).get('script_id')
        if not script_id:
            self._last_error = api_response(
                success=False,
                message="Library script item is missing its script reference.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
            return None

        src = get_object_or_404(Script, pk=script_id)

        # Derive a collision-free name in the user's script namespace.
        filename = src.name
        stem, dot, ext = filename.rpartition('.')
        if not dot:
            stem, ext = filename, ''
        suffix = f".{ext}" if ext else ""

        candidate_stem = stem
        n = 0
        while Script.objects.filter(
            owner=user, pathname=f"scripts/{candidate_stem}{suffix}"
        ).exists():
            n += 1
            candidate_stem = f"{stem}_copy" if n == 1 else f"{stem}_copy{n}"

        new_filename = f"{candidate_stem}{suffix}"
        new_pathname = f"scripts/{new_filename}"

        try:
            with transaction.atomic():
                new_script = Script.objects.create(
                    name=new_filename,
                    pathname=new_pathname,
                    blob_url="",
                    download_url="",
                    owner=user,
                    content_type=src.content_type,
                    file_size=src.file_size,
                    version=1,
                )
                src_blob = build_blob_path(src.owner_id, src.id, src.name)
                dst_blob = build_blob_path(user.id, new_script.id, new_filename)
                gcs_url = copy_script(src_blob, dst_blob)
                new_script.blob_url = gcs_url
                new_script.download_url = gcs_url
                new_script.save(update_fields=['blob_url', 'download_url'])
        except GoogleCloudError as e:
            logger.error(f"GCS error while forking library script {script_id}: {e}")
            self._last_error = api_response(
                success=False,
                message="Failed to copy script from cloud storage.",
                errors={"storage": ["GCS service error. Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
            return None

        return {
            "type": "script",
            "id": new_script.id,
            "name": new_filename,
            "redirect_url": f"/script-editor/{new_filename}",
        }

    def _fork_node(self, item):
        return {
            "type": "node",
            "node_data": item.content or {},
        }
