"""Sage conversations: listed and opened by the CLI, written by the autobot service.

Every route is per user (the SageCode key's owner, or a Clerk session for the
web later) and every query is scoped to ``request.user``. The autobot service
writes turns and summaries forwarding the user's own key, so a user can only
ever write their own rows; nothing here trusts a client for anything beyond
its own data.

    GET    conversations/                 recent conversations (for /sessions)
    POST   conversations/                 start one (deletes the oldest past the cap)
    GET    conversations/<id>/            meta + what Sage needs to continue + recent transcript
    DELETE conversations/<id>/
    POST   conversations/<id>/turns/      append a finished turn
    POST   conversations/<id>/summaries/  record a summary of the older turns
"""

import json

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated

from server.rate_limiters import SageBurstThrottle, SageSustainedThrottle
from server.utils import api_response
from users.models import ApiKey

from .models import MAX_CONVERSATIONS_PER_USER, SageConversation, SageSummary, SageTurn

_THROTTLES = [SageBurstThrottle, SageSustainedThrottle]

# Bounds on what a client may store. The autobot service trims long tool
# output before it gets here; these stop anything that slips past it.
MAX_PROMPT_CHARS = 20_000
MAX_REPLY_CHARS = 100_000
MAX_MESSAGES_CHARS = 400_000
MAX_SUMMARY_CHARS = 30_000
# What opening a conversation returns: the turns after the latest summary
# (for the model) and the recent prompts/replies (for the screen).
MAX_CONTEXT_TURNS = 50
TRANSCRIPT_TURNS = 20


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sage_ping(request):
    """Authenticated canary for the Sage app: proves routing + auth reach it.

    Read-only and touches no table. Reports which credential kind was used so a
    deploy can be checked from both the CLI (API key) and the browser (Clerk).
    """
    client = 'cli' if isinstance(request.auth, ApiKey) else 'web'
    return api_response(message='Sage is reachable.', data={'service': 'sage_api', 'client': client})


def _bad(message):
    return api_response(success=False, message=message, status_code=status.HTTP_400_BAD_REQUEST)


def _text(value, limit):
    return value[:limit] if isinstance(value, str) else ''


def _count(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _folder_name(value):
    """Only the last part of a path: the full local path never gets stored."""
    if not isinstance(value, str):
        return ''
    return value.replace('\\', '/').rstrip('/').rsplit('/', 1)[-1][:255]


def _conversation_data(convo):
    key = convo.api_key
    return {
        'id': str(convo.id),
        'title': convo.title,
        'workspace': convo.workspace,
        'turn_count': convo.turn_count,
        'created_at': convo.created_at,
        'last_turn_at': convo.last_turn_at,
        'device': (key.name or key.client_os) if key else '',
    }


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes(_THROTTLES)
def conversations(request):
    if request.method == 'GET':
        try:
            limit = min(max(int(request.query_params.get('limit', 20)), 1), 50)
        except ValueError:
            limit = 20
        rows = (SageConversation.objects.filter(user=request.user).select_related('api_key')
                .order_by(F('last_turn_at').desc(nulls_last=True), '-created_at')[:limit])
        return api_response(data={'conversations': [_conversation_data(c) for c in rows]})

    body = request.data if isinstance(request.data, dict) else {}
    with transaction.atomic():
        convo = SageConversation.objects.create(
            user=request.user,
            api_key=request.auth if isinstance(request.auth, ApiKey) else None,
            title=_text(body.get('title'), 200).strip(),
            workspace=_folder_name(body.get('workspace')),
            last_turn_at=timezone.now(),
        )
        # Keep the newest MAX_CONVERSATIONS_PER_USER; the new one is newest.
        stale = list(SageConversation.objects.filter(user=request.user)
                     .order_by(F('last_turn_at').desc(nulls_last=True), '-created_at')
                     .values_list('id', flat=True)[MAX_CONVERSATIONS_PER_USER:])
        if stale:
            SageConversation.objects.filter(user=request.user, id__in=stale).delete()
    return api_response(message='Conversation started.', data=_conversation_data(convo),
                        status_code=status.HTTP_201_CREATED)


@api_view(['GET', 'DELETE'])
@permission_classes([IsAuthenticated])
@throttle_classes(_THROTTLES)
def conversation_detail(request, conversation_id):
    convo = get_object_or_404(SageConversation.objects.select_related('api_key'),
                              id=conversation_id, user=request.user)
    if request.method == 'DELETE':
        convo.delete()
        return api_response(message='Conversation deleted.')

    summary = convo.summaries.order_by('-up_to_seq').first()
    after = summary.up_to_seq if summary else 0
    context = list(convo.turns.filter(seq__gt=after).order_by('-seq')
                   .values('seq', 'messages')[:MAX_CONTEXT_TURNS])[::-1]
    transcript = list(convo.turns.order_by('-seq')
                      .values('seq', 'prompt', 'reply', 'cancelled', 'created_at')[:TRANSCRIPT_TURNS])[::-1]
    return api_response(data={
        **_conversation_data(convo),
        'summary': {'text': summary.text, 'up_to_seq': summary.up_to_seq} if summary else None,
        'turns': context,
        'transcript': transcript,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes(_THROTTLES)
def append_turn(request, conversation_id):
    body = request.data if isinstance(request.data, dict) else {}
    messages = body.get('messages')
    if not isinstance(messages, list) or not all(isinstance(m, dict) for m in messages):
        return _bad('messages must be a list of message objects.')
    if len(json.dumps(messages, ensure_ascii=False)) > MAX_MESSAGES_CHARS:
        return _bad('This turn is too large to save.')

    with transaction.atomic():
        convo = get_object_or_404(SageConversation.objects.select_for_update(),
                                  id=conversation_id, user=request.user)
        seq = convo.turn_count + 1                 # assigned here, never by the client
        prompt = _text(body.get('prompt'), MAX_PROMPT_CHARS)
        SageTurn.objects.create(
            conversation=convo, user=request.user, seq=seq,
            prompt=prompt,
            reply=_text(body.get('reply'), MAX_REPLY_CHARS),
            messages=messages,
            model=_text(body.get('model'), 255),
            is_byo=body.get('is_byo') is True,
            prompt_tokens=_count(body.get('prompt_tokens')),
            completion_tokens=_count(body.get('completion_tokens')),
            total_tokens=_count(body.get('total_tokens')),
            tool_calls=_count(body.get('tool_calls')),
            limit_reached=body.get('limit_reached') is True,
            cancelled=body.get('cancelled') is True,
        )
        convo.turn_count = seq
        convo.last_turn_at = timezone.now()
        fields = ['turn_count', 'last_turn_at']
        if not convo.title and prompt.strip():
            convo.title = ' '.join(prompt.split())[:200]
            fields.append('title')
        convo.save(update_fields=fields)
    return api_response(message='Turn saved.', data={'seq': seq}, status_code=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes(_THROTTLES)
def add_summary(request, conversation_id):
    body = request.data if isinstance(request.data, dict) else {}
    convo = get_object_or_404(SageConversation, id=conversation_id, user=request.user)
    text = body.get('text')
    up_to = body.get('up_to_seq')
    if not isinstance(text, str) or not text.strip():
        return _bad('text is required.')
    if len(text) > MAX_SUMMARY_CHARS:
        return _bad('This summary is too long.')
    if not isinstance(up_to, int) or isinstance(up_to, bool) or not 1 <= up_to <= convo.turn_count:
        return _bad('up_to_seq must name a saved turn.')
    summary = SageSummary.objects.create(
        conversation=convo, up_to_seq=up_to, text=text,
        model=_text(body.get('model'), 255),
        is_byo=body.get('is_byo') is True,
        total_tokens=_count(body.get('total_tokens')),
    )
    return api_response(message='Summary saved.', data={'up_to_seq': summary.up_to_seq},
                        status_code=status.HTTP_201_CREATED)
