import hmac
import logging
from datetime import timedelta

from django.conf import settings as django_settings
from django.core.paginator import EmptyPage, Paginator
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from pgvector.django import CosineDistance
from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from autobot_api import embeddings
from autobot_api.models import (
    DOC_CHUNK_MAX_CHARS,
    DocChunk,
    LLMConfig,
    Message,
    Summary,
    Thread,
    UserSettings,
)
from autobot_api.serializers import (
    LLMConfigRevealSerializer,
    LLMConfigSerializer,
    MessageSerializer,
    SummarySerializer,
    ThreadSerializer,
    UserSettingsSerializer,
)
from server.rate_limiters import (
    AutobotBurstThrottle,
    AutobotSustainedThrottle,
    DocsSearchThrottle,
)
from server.utils import api_response
from billing.enforcement import check_plan_limit

logger = logging.getLogger(__name__)

# Bounds on the docs-search request, defending the public endpoint against
# pathological inputs even behind the internal-secret gate + throttle.
_DOCS_SEARCH_MAX_QUERY_CHARS = 1000
_DOCS_SEARCH_DEFAULT_TOP_K = 5
_DOCS_SEARCH_MAX_TOP_K = 10


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
            # USER-message count drives the client's long-thread guardrails —
            # reliable regardless of how many message pages are loaded.
            user_message_count=Count(
                'messages', filter=Q(messages__role=Message.Role.USER)
            ),
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

    @check_plan_limit(
        'max_autobot_threads',
        lambda user: Thread.objects.filter(user=user, is_archived=False).count()
    )
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
            user_message_count=Count(
                'messages', filter=Q(messages__role=Message.Role.USER)
            ),
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


# ── Message + Summary (T07) ──────────────────────────────────────────────────
#
# Both endpoints are scoped to a parent Thread via the URL — the per-user
# auth check happens by loading the thread under `user=request.user` and
# 404-ing on any miss. Cross-user enumeration of thread UUIDs is the only
# auth surface, and the 404 response is identical whether the thread
# doesn't exist or belongs to someone else.
#
# `thread` is never read from the request body — it's always taken from
# the URL via the view's `_get_thread_or_404` helper. Mass-assignment of
# the parent FK is impossible.


# Pagination defaults — messages flow much higher volume than summaries.
DEFAULT_MESSAGE_PAGE_SIZE = 50
MAX_MESSAGE_PAGE_SIZE = 200
DEFAULT_SUMMARY_PAGE_SIZE = 20
MAX_SUMMARY_PAGE_SIZE = 100


def _paginated_response(qs, page, page_size, list_key, serializer_cls, ctx=None):
    """Shared pagination wrapper for Message/Summary lists.

    Returns the same envelope shape used by ThreadListCreateView.list so
    the client only deals with one pagination contract across the app.
    """
    paginator = Paginator(qs, page_size)
    try:
        page_obj = paginator.page(page)
    except EmptyPage:
        return api_response(
            success=True,
            message='Retrieved successfully.',
            data={
                list_key: [],
                'total_count': paginator.count,
                'total_pages': paginator.num_pages,
                'current_page': page,
                'page_size': page_size,
            },
            status_code=status.HTTP_200_OK,
        )

    serializer = serializer_cls(page_obj.object_list, many=True, context=ctx or {})
    return api_response(
        success=True,
        message='Retrieved successfully.',
        data={
            list_key: serializer.data,
            'total_count': paginator.count,
            'total_pages': paginator.num_pages,
            'current_page': page_obj.number,
            'page_size': page_size,
        },
        status_code=status.HTTP_200_OK,
    )


class _ThreadScopedView(generics.GenericAPIView):
    """Shared base for views nested under /threads/<thread_id>/.

    Provides `_get_thread_or_404` so per-user thread scoping is enforced
    in exactly one place. Subclasses use this to look up the parent
    thread before any list / create operation.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def _get_thread_or_404(self):
        thread_id = self.kwargs.get('thread_id')
        try:
            return Thread.objects.get(id=thread_id, user=self.request.user)
        except Thread.DoesNotExist:
            # Same response shape whether the thread doesn't exist or
            # belongs to another user — don't leak which.
            raise NotFound('Thread not found.')


class MessageListCreateView(_ThreadScopedView, generics.ListCreateAPIView):
    """GET  /api/autobot/threads/<thread_id>/messages/   — paginated history
    POST /api/autobot/threads/<thread_id>/messages/   — append a message

    Query params on GET:
      • ?page=N           (default 1)
      • ?page_size=N      (default 50, clamped to [1, 200])

    POST honors idempotency via the optional `client_id` field — repeat
    POSTs with the same value in the same thread return the existing
    message (200) instead of creating a duplicate (201). The partial
    unique constraint on (thread, client_id) is the race-safe backstop.
    """

    serializer_class = MessageSerializer

    def get_queryset(self):
        # `thread__user` is the auth check that scopes by user.
        return Message.objects.filter(
            thread_id=self.kwargs.get('thread_id'),
            thread__user=self.request.user,
        )

    def list(self, request, *args, **kwargs):
        # Ensure the thread exists + belongs to the user before paginating.
        self._get_thread_or_404()

        try:
            page = int(request.query_params.get('page', 1))
            page_size = int(
                request.query_params.get('page_size', DEFAULT_MESSAGE_PAGE_SIZE)
            )
        except ValueError:
            return api_response(
                success=False,
                message='Invalid pagination parameters.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        page_size = min(max(page_size, 1), MAX_MESSAGE_PAGE_SIZE)

        # `?ordering=` lets clients fetch the LATEST N messages
        # (needed by autobot's chat loop to assemble recent context
        # without first paginating to the last page). Whitelist the
        # values so an arbitrary string can't be passed into order_by.
        ordering = request.query_params.get('ordering') or 'created_at'
        if ordering not in ('created_at', '-created_at'):
            ordering = 'created_at'

        qs = self.get_queryset().order_by(ordering)
        response = _paginated_response(
            qs, page, page_size, 'messages', MessageSerializer,
        )
        # Custom success message for the typical case.
        if response.data.get('data', {}).get('total_count', 0) >= 0:
            response.data['message'] = 'Messages retrieved successfully.'
        return response

    def create(self, request, *args, **kwargs):
        thread = self._get_thread_or_404()

        # ── Idempotency replay check ──────────────────────────────────────
        # If client_id is provided and a prior message in this thread
        # already used it, return that prior message untouched (200, not
        # 201). Same contract as the HTTP trigger idempotency-key flow.
        client_id = ''
        if isinstance(request.data, dict):
            client_id = (request.data.get('client_id') or '').strip()

        if client_id:
            existing = Message.objects.filter(
                thread=thread, client_id=client_id,
            ).first()
            if existing is not None:
                return api_response(
                    success=True,
                    message='Duplicate request — returning prior message.',
                    data=self.get_serializer(existing).data,
                    status_code=status.HTTP_200_OK,
                )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Race-safe create: another concurrent POST with the same client_id
        # could land between our SELECT above and INSERT below. The partial
        # unique index will fire IntegrityError; we catch it and return the
        # prior row (now visible).
        try:
            with transaction.atomic():
                message = serializer.save(thread=thread)
                # Sidebar ordering: update parent thread's last_message_at.
                # update() bypasses save() so modified_at isn't touched —
                # we don't want "edited 1m ago" to flicker on every chat.
                Thread.objects.filter(pk=thread.pk).update(
                    last_message_at=message.created_at,
                )
        except IntegrityError:
            if client_id:
                existing = Message.objects.filter(
                    thread=thread, client_id=client_id,
                ).first()
                if existing is not None:
                    logger.info(
                        'Message create race resolved: thread=%s client_id=%s',
                        thread.id, client_id,
                    )
                    return api_response(
                        success=True,
                        message='Duplicate request — returning prior message.',
                        data=self.get_serializer(existing).data,
                        status_code=status.HTTP_200_OK,
                    )
            raise

        return api_response(
            success=True,
            message='Message created successfully.',
            data=self.get_serializer(message).data,
            status_code=status.HTTP_201_CREATED,
        )


class SummaryListCreateView(_ThreadScopedView, generics.ListCreateAPIView):
    """GET  /api/autobot/threads/<thread_id>/summaries/   — list (most-recent first)
    POST /api/autobot/threads/<thread_id>/summaries/   — record a new summary
    """

    serializer_class = SummarySerializer

    def get_queryset(self):
        return Summary.objects.filter(
            thread_id=self.kwargs.get('thread_id'),
            thread__user=self.request.user,
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        # Used by SummarySerializer.validate_up_to_message to ensure the
        # anchor lives in THIS thread, not just any of the user's threads.
        ctx['thread_id'] = self.kwargs.get('thread_id')
        return ctx

    def list(self, request, *args, **kwargs):
        self._get_thread_or_404()

        try:
            page = int(request.query_params.get('page', 1))
            page_size = int(
                request.query_params.get('page_size', DEFAULT_SUMMARY_PAGE_SIZE)
            )
        except ValueError:
            return api_response(
                success=False,
                message='Invalid pagination parameters.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        page_size = min(max(page_size, 1), MAX_SUMMARY_PAGE_SIZE)

        qs = self.get_queryset().order_by('-created_at')
        response = _paginated_response(
            qs, page, page_size, 'summaries', SummarySerializer,
            ctx=self.get_serializer_context(),
        )
        if response.data.get('data', {}).get('total_count', 0) >= 0:
            response.data['message'] = 'Summaries retrieved successfully.'
        return response

    def create(self, request, *args, **kwargs):
        thread = self._get_thread_or_404()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        summary = serializer.save(thread=thread)

        return api_response(
            success=True,
            message='Summary created successfully.',
            data=self.get_serializer(summary).data,
            status_code=status.HTTP_201_CREATED,
        )


# ── UserSettings (T08) ───────────────────────────────────────────────────────
#
# Singleton-per-user resource. There is no <id> in the URL — the row is
# always located via the OneToOne back to `request.user`. Auto-created on
# first GET so the client never has to think about whether the row exists.
#
# Auth model:
#   • Authentication: IsAuthenticated.
#   • Authorization: implicit. `get_object` always returns the row keyed
#     by request.user. A client literally cannot address another user's
#     settings — there's no UUID surface to attack.
#   • Mass-assignment: `user` is not in the serializer fields; assigned
#     server-side via get_or_create.
#   • IDOR on default_llm_config: serializer rejects cross-user FK
#     targets (matches Thread.llm_config validation).
#   • No DELETE — settings live as long as the user does (CASCADE on
#     user delete handles cleanup).


class UserSettingsView(generics.RetrieveUpdateAPIView):
    """GET   /api/autobot/settings/   — retrieve (auto-creates on first call)
    PATCH /api/autobot/settings/   — partial update
    """

    serializer_class = UserSettingsSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def get_object(self):
        # Auto-create on first access. The OneToOneField on the model
        # guarantees there's at most one row per user — get_or_create
        # is race-safe because a concurrent INSERT would fail the
        # one_to_one constraint and our second SELECT would see the
        # winning row.
        settings_obj, _ = UserSettings.objects.get_or_create(
            user=self.request.user,
        )
        return settings_obj

    def get_serializer_context(self):
        # Threaded through so validate_default_llm_config can see
        # request.user for the cross-user FK check.
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message='Settings retrieved successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def update(self, request, *args, **kwargs):
        # Force partial=True so PATCH is the canonical update path.
        # A bare PUT with a missing field shouldn't blank it.
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message='Settings updated successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )


# ── Dashboard (T25) ──────────────────────────────────────────────────────────
#
# Aggregator endpoint that surfaces token/request usage for the caller.
# Buckets are computed at three fixed windows (today, last 7 days, all-time)
# in one response so the client never has to make multiple round-trips just
# to render the dashboard. Aggregation rules:
#   • Only assistant messages count — user-turn rows carry no tokens.
#   • Threads scope by request.user; cross-user message rows never bleed
#     through (the queryset filter is `thread__user=request.user`).
#   • Provider/model rows with both blank are excluded from `model_usage`
#     to avoid an "Unknown/Unknown" bucket dominating early/no-data states.


def _bucket_stats(qs):
    """Reduce an assistant-message queryset to the dashboard bucket shape.

    Single pass over the queryset; the SUMs and COUNT come back from
    Postgres as one aggregate row, and a separate `values().annotate()`
    powers the per-(provider, model_name) breakdown.
    """
    totals = qs.aggregate(
        requests=Count('id'),
        total_tokens=Sum('total_tokens'),
        prompt_tokens=Sum('prompt_tokens'),
        completion_tokens=Sum('completion_tokens'),
    )
    # Split admin vs BYO token totals — provider strings are not enough
    # to tell them apart because users can BYO the same provider that
    # admin pool uses (e.g. user-supplied Gemini key vs admin Gemini).
    admin_tokens = qs.filter(is_byo=False).aggregate(s=Sum('total_tokens'))['s'] or 0
    byo_tokens = qs.filter(is_byo=True).aggregate(s=Sum('total_tokens'))['s'] or 0

    requests = totals['requests'] or 0
    total_tokens = totals['total_tokens'] or 0
    avg = (total_tokens // requests) if requests else 0

    # Per (provider, model_name) breakdown — drives the model-usage chart.
    # Exclude rows where both fields are blank (legacy/pre-T25 data).
    usage_qs = (
        qs.exclude(provider='', model_name='')
        .values('provider', 'model_name')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    model_usage = [
        {
            'provider': row['provider'],
            'model': row['model_name'],
            'count': row['count'],
        }
        for row in usage_qs
    ]

    return {
        'requests': requests,
        'total_tokens': total_tokens,
        'prompt_tokens': totals['prompt_tokens'] or 0,
        'completion_tokens': totals['completion_tokens'] or 0,
        'avg_tokens_per_request': avg,
        'admin_tokens': admin_tokens,
        'byo_tokens': byo_tokens,
        'model_usage': model_usage,
    }


class DashboardView(APIView):
    """GET /api/autobot/dashboard/

    Returns per-user usage telemetry across three windows. No path params,
    no query params — keep the surface trivial. Throttled with the same
    autobot_burst/sustained scopes as the other Autobot endpoints so a
    dashboard tab on a poll loop can't escape the request budget.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def get(self, request):
        now = timezone.now()
        # `today` is the start of the current UTC day. The Autobot quota
        # counter (T18a) uses the same UTC date boundary in its Redis key
        # name (`yyyymmdd`), so this matches — no drift between the two
        # "today" definitions.
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)

        base = Message.objects.filter(
            thread__user=request.user,
            role=Message.Role.ASSISTANT,
        )

        payload = {
            'today': _bucket_stats(base.filter(created_at__gte=today_start)),
            'last_7d': _bucket_stats(base.filter(created_at__gte=week_start)),
            'all_time': _bucket_stats(base),
        }

        return api_response(
            success=True,
            message='Dashboard retrieved successfully.',
            data=payload,
            status_code=status.HTTP_200_OK,
        )


# ── Docs RAG search (Pillar A) ─────────────────────────────────────────────
#
# Public-permission endpoint, but NOT openly callable: gated by a shared
# X-Internal-Secret that only the autobot service knows (it calls this over the
# internal compose bridge on behalf of the public docs widget). The docs content
# is public, so leaking a snippet is not sensitive — the gate exists to keep the
# endpoint off the open internet and bound abuse. No Clerk user is involved, so
# there is no per-user scoping here (DocChunk is global by design).


def _docs_secret_ok(request) -> bool:
    """Constant-time compare of the presented X-Internal-Secret.

    Fails closed if the server secret is unset, so a misconfigured deploy can
    never accidentally expose the endpoint without a secret.
    """
    expected = getattr(django_settings, 'AUTOBOT_INTERNAL_SECRET', '') or ''
    presented = request.headers.get('X-Internal-Secret', '') or ''
    if not expected or not presented:
        return False
    return hmac.compare_digest(presented, expected)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([DocsSearchThrottle])
def docs_search(request):
    """POST /api/autobot/docs/search/ — semantic search over the docs corpus.

    Auth: ``X-Internal-Secret`` header (autobot → Django, internal bridge).
    Body: ``{"query": "...", "top_k": 5}``.
    Returns the top-k most similar chunks by cosine distance:
    ``[{title, url, heading_path, snippet}, ...]``.
    """
    if not _docs_secret_ok(request):
        # Same generic 401 whether the secret is missing or wrong — no oracle.
        return api_response(
            success=False,
            message='Invalid or missing internal secret.',
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    data = request.data if isinstance(request.data, dict) else {}
    query = (data.get('query') or '').strip()
    if not query:
        return api_response(
            success=False,
            message='`query` is required.',
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    query = query[:_DOCS_SEARCH_MAX_QUERY_CHARS]

    try:
        top_k = int(data.get('top_k', _DOCS_SEARCH_DEFAULT_TOP_K))
    except (TypeError, ValueError):
        top_k = _DOCS_SEARCH_DEFAULT_TOP_K
    top_k = max(1, min(top_k, _DOCS_SEARCH_MAX_TOP_K))

    query_vector = embeddings.embed_query(query)

    # CosineDistance matches the HNSW index opclass (vector_cosine_ops); smaller
    # distance = more similar, so ascending order gives the best matches first.
    results = (
        DocChunk.objects
        .order_by(CosineDistance('embedding', query_vector))[:top_k]
    )

    # Return the FULL chunk content (defensively capped at the same bound the
    # ingester enforces). The chunk is the retrieval unit, so the model must see
    # all of what was embedded — truncating here would hide ranked-on content.
    payload = [
        {
            'title': chunk.title,
            'url': chunk.url,
            'heading_path': chunk.heading_path,
            'content': chunk.content[:DOC_CHUNK_MAX_CHARS],
        }
        for chunk in results
    ]

    return api_response(
        success=True,
        message='Docs search completed.',
        data={'results': payload},
        status_code=status.HTTP_200_OK,
    )
