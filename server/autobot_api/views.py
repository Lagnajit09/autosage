import logging

from django.core.paginator import EmptyPage, Paginator
from django.db.models import Count
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from autobot_api.models import LLMConfig, Thread
from autobot_api.serializers import (
    LLMConfigRevealSerializer,
    LLMConfigSerializer,
    ThreadSerializer,
)
from server.rate_limiters import AutobotBurstThrottle, AutobotSustainedThrottle
from server.utils import api_response

logger = logging.getLogger(__name__)


class LLMConfigListCreateView(generics.ListCreateAPIView):
    """GET  /api/autobot/llm-configs/   — list the caller's configs
    POST /api/autobot/llm-configs/   — create a new config
    """

    serializer_class = LLMConfigSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def get_queryset(self):
        return LLMConfig.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM configs retrieved successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config created successfully.',
            data=response.data,
            status_code=status.HTTP_201_CREATED,
        )


class LLMConfigDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET    /api/autobot/llm-configs/<id>/
    PATCH  /api/autobot/llm-configs/<id>/
    DELETE /api/autobot/llm-configs/<id>/
    """

    serializer_class = LLMConfigSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]
    lookup_field = 'pk'

    def get_queryset(self):
        return LLMConfig.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config retrieved successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def update(self, request, *args, **kwargs):
        # PATCH (partial) is the typical update path; DRF generic handles
        # full PUT too, but we don't promise that.
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config updated successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config deleted successfully.',
            status_code=status.HTTP_200_OK,
        )


class LLMConfigRevealView(APIView):
    """POST /api/autobot/llm-configs/<id>/reveal/

    Returns the decrypted api_key plus the rest of the config so Autobot
    can issue a chat completion. Verb is POST (not GET) because it's an
    action with side effects we may want to log/audit later, mirroring the
    Vault credential `/reveal/` convention.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def post(self, request, pk):
        try:
            config = LLMConfig.objects.get(pk=pk, user=request.user)
        except LLMConfig.DoesNotExist:
            return api_response(
                success=False,
                message='LLM config not found or access denied.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        logger.info(
            'LLMConfig revealed: id=%s user=%s provider=%s',
            config.id, request.user.username, config.provider,
        )

        return api_response(
            success=True,
            message='LLM config revealed.',
            data=LLMConfigRevealSerializer(config).data,
            status_code=status.HTTP_200_OK,
        )


# ── Thread (T06) ─────────────────────────────────────────────────────────────
#
# Authorization model:
#   • Every queryset filters by `user=self.request.user`. This is the ONLY
#     thing standing between a request and another user's threads. Any
#     change to these views MUST preserve that filter.
#   • The serializer omits `user` from its `fields`, so PATCH / POST cannot
#     reassign ownership. `perform_create` sets it from request.user.
#   • The serializer validates `llm_config` belongs to the requesting user
#     (see ThreadSerializer.validate_llm_config) — closes the IDOR vector
#     where a guessed cross-user LLMConfig UUID could be attached.
#   • Throttling (AutobotBurst/Sustained) is on every method.
#   • Pagination is mandatory on list to bound the response size; raw
#     query params are clamped to [1, 100].


# Default page size when the client doesn't specify one. Reasonable for
# the history sidebar.
DEFAULT_THREAD_PAGE_SIZE = 20
MAX_THREAD_PAGE_SIZE = 100


class ThreadListCreateView(generics.ListCreateAPIView):
    """GET  /api/autobot/threads/        — list the caller's threads
    POST /api/autobot/threads/        — create a new thread

    Query params on GET:
      • ?page=N            (default 1)
      • ?page_size=N       (default 20, clamped to [1, 100])
      • ?is_archived=true  → only archived threads
      • ?is_archived=all   → archived + active
      •  (default)         → only active threads (the sidebar default)
    """

    serializer_class = ThreadSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def get_queryset(self):
        # Per-user scoping — the only auth check that matters here.
        qs = Thread.objects.filter(user=self.request.user).annotate(
            message_count=Count('messages'),
        )

        archived_param = (
            self.request.query_params.get('is_archived') or ''
        ).lower()
        if archived_param == 'true':
            qs = qs.filter(is_archived=True)
        elif archived_param != 'all':
            # Default: hide archived threads from the sidebar.
            qs = qs.filter(is_archived=False)

        # Tie-break by created_at when last_message_at is NULL (brand-new
        # threads with no messages yet).
        return qs.order_by('-last_message_at', '-created_at')

    def get_serializer_context(self):
        # Threaded through so `validate_llm_config` can access request.user.
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def perform_create(self, serializer):
        # CRITICAL: owner is set from request.user, NEVER from request body.
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        try:
            page = int(request.query_params.get('page', 1))
            page_size = int(
                request.query_params.get('page_size', DEFAULT_THREAD_PAGE_SIZE)
            )
        except ValueError:
            return api_response(
                success=False,
                message='Invalid pagination parameters.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        page_size = min(max(page_size, 1), MAX_THREAD_PAGE_SIZE)

        qs = self.get_queryset()
        paginator = Paginator(qs, page_size)

        try:
            page_obj = paginator.page(page)
        except EmptyPage:
            # Out-of-range page — return empty list with metadata so the
            # client can adjust without an error.
            return api_response(
                success=True,
                message='Threads retrieved successfully.',
                data={
                    'threads': [],
                    'total_count': paginator.count,
                    'total_pages': paginator.num_pages,
                    'current_page': page,
                    'page_size': page_size,
                },
                status_code=status.HTTP_200_OK,
            )

        serializer = self.get_serializer(page_obj.object_list, many=True)
        return api_response(
            success=True,
            message='Threads retrieved successfully.',
            data={
                'threads': serializer.data,
                'total_count': paginator.count,
                'total_pages': paginator.num_pages,
                'current_page': page_obj.number,
                'page_size': page_size,
            },
            status_code=status.HTTP_200_OK,
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message='Thread created successfully.',
            data=response.data,
            status_code=status.HTTP_201_CREATED,
        )


class ThreadDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET    /api/autobot/threads/<id>/   — retrieve
    PATCH  /api/autobot/threads/<id>/   — rename / archive / change llm_config
    DELETE /api/autobot/threads/<id>/   — hard-delete (cascades to messages + summaries)
    """

    serializer_class = ThreadSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]
    lookup_field = 'pk'

    def get_queryset(self):
        return Thread.objects.filter(user=self.request.user).annotate(
            message_count=Count('messages'),
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message='Thread retrieved successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def update(self, request, *args, **kwargs):
        # PATCH (partial) is the intended path. Force partial=True so a
        # full PUT body isn't required.
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message='Thread updated successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message='Thread deleted successfully.',
            status_code=status.HTTP_200_OK,
        )
