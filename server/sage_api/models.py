"""Persistence for Sage, the SageCode agent.

Kept separate from ``autobot_api`` so the web chat's tables (Thread, Message,
Summary, ...) never change shape for the agent.

A conversation is a list of turns. A turn is Sage's unit of history: the
user's message, any tool calls with their results, and the reply. It's written
once, when the turn ends, by the autobot service (forwarding the user's
SageCode key, so every row is the key owner's). Long tool output and file
contents are trimmed *before* a turn is stored (autobot sage/store.py): the
contents of a user's local files never land here in full.

When a conversation gets long, Sage summarizes its older turns into a
`SageSummary`. Turns are never rewritten or deleted for that: the summary
says which turns it covers, and loading a conversation for the model fetches
only the latest summary plus the turns after it.

Each user keeps their newest ``MAX_CONVERSATIONS_PER_USER`` conversations;
starting another deletes the oldest (views.py).
"""

import uuid

from django.conf import settings
from django.db import models

MAX_CONVERSATIONS_PER_USER = 100


class SageConversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # db_index=False: the (user, -last_turn_at) index below covers user lookups.
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='sage_conversations', db_index=False)
    # The SageCode session (device) it was started on, for the /sessions list.
    # SET_NULL: revoking a session must not take its conversations with it.
    api_key = models.ForeignKey('users.ApiKey', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='sage_conversations')
    # The first message, shortened. Shown in /sessions.
    title = models.CharField(max_length=200, blank=True)
    # The workspace folder's name only (never the full local path), so the
    # user can tell conversations apart.
    workspace = models.CharField(max_length=255, blank=True)
    turn_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    # Ordering key for /sessions ("what was I last doing"); set on every turn.
    last_turn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'sage_conversations'
        ordering = ['-last_turn_at', '-created_at']
        indexes = [models.Index(fields=['user', '-last_turn_at'], name='sage_conv_user_recent_idx')]

    def __str__(self) -> str:
        return f"Sage conversation {self.id} ({self.title or 'untitled'})"


class SageTurn(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # db_index=False on both FKs: the (conversation, seq) unique constraint and
    # the (user, created_at) index below already cover these lookups.
    conversation = models.ForeignKey(SageConversation, on_delete=models.CASCADE, related_name='turns',
                                     db_index=False)
    # Denormalised from the conversation so usage can be totalled per user and
    # day without a join (SageCode usage on the Autosage dashboard).
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='sage_turns', db_index=False)
    seq = models.PositiveIntegerField()                    # 1, 2, 3… within the conversation
    # What the user typed and the reply they saw: for showing a resumed
    # conversation without parsing `messages`.
    prompt = models.TextField(blank=True)
    reply = models.TextField(blank=True)
    # The turn as the model saw it (OpenAI message format), long tool output
    # and file text already trimmed.
    messages = models.JSONField(default=list)
    model = models.CharField(max_length=255, blank=True)   # provider/model that answered
    # Same meaning as autobot_messages.is_byo: the user's own LLM key, not the
    # shared allowance. The dashboard splits usage on it.
    is_byo = models.BooleanField(default=False)
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    tool_calls = models.PositiveIntegerField(default=0)
    limit_reached = models.BooleanField(default=False)     # stopped at the step limit
    cancelled = models.BooleanField(default=False)         # stopped by the user
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sage_turns'
        ordering = ['seq']
        constraints = [models.UniqueConstraint(fields=['conversation', 'seq'],
                                               name='sage_turn_conversation_seq_uniq')]
        indexes = [models.Index(fields=['user', 'created_at'], name='sage_turn_user_created_idx')]

    def __str__(self) -> str:
        return f"Sage turn {self.seq} of {self.conversation_id}"


class SageSummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # db_index=False: the (conversation, -up_to_seq) index below covers it.
    conversation = models.ForeignKey(SageConversation, on_delete=models.CASCADE,
                                     related_name='summaries', db_index=False)
    # Covers every turn with seq <= this one (it folds in the previous summary).
    up_to_seq = models.PositiveIntegerField()
    text = models.TextField()
    # What making the summary cost, for usage totals.
    model = models.CharField(max_length=255, blank=True)
    is_byo = models.BooleanField(default=False)
    total_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sage_summaries'
        ordering = ['-up_to_seq']
        indexes = [models.Index(fields=['conversation', '-up_to_seq'], name='sage_summary_latest_idx')]

    def __str__(self) -> str:
        return f"Sage summary of {self.conversation_id} up to turn {self.up_to_seq}"
