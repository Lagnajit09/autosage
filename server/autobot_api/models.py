import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q, UniqueConstraint
from django.utils.translation import gettext_lazy as _
from pgvector.django import HnswIndex, VectorField

from vault.fields import EncryptedCharField

# Local embedding model: fastembed "BAAI/bge-base-en-v1.5" → 768-dim vectors.
# Ingestion (doc chunks) and query embedding MUST use this same model, or cosine
# distances are meaningless. Centralized in autobot_api/embeddings.py.
DOC_EMBEDDING_DIMENSIONS = 768

# Max characters of chunk content. Kept safely under the embedding model's
# 512-token input limit (bge-base-en-v1.5 silently truncates beyond that), so a
# chunk's whole text is captured by its vector. Single source of truth: the
# ingester splits any longer section to this bound, and the search view returns
# chunk content up to this bound (so the model sees exactly what was embedded).
DOC_CHUNK_MAX_CHARS = 1800


class LLMConfig(models.Model):
    """A user's BYO LLM provider configuration for Autobot.

    Lives in `autobot_api` (not `vault/`) because it's *settings that happen
    to contain a secret* rather than auth material for a workflow execution
    target. Vault's Credential model holds username/password/ssh_key/cert
    shaped data for SSH / WinRM / SMTP targets; LLMConfig holds structured
    per-provider chat configuration. The Fernet-encrypted `api_key` reuses
    `vault.fields.EncryptedCharField` so secret-at-rest behavior is uniform.

    `api_key` is intentionally NEVER returned by the standard list/retrieve
    serializer. The dedicated `POST .../reveal/` endpoint is the only path
    that hands back the plaintext, mirroring how `vault.Credential` works.
    """

    class Provider(models.TextChoices):
        GEMINI = 'gemini', _('Gemini')
        GROQ = 'groq', _('Groq')
        OPENROUTER = 'openrouter', _('OpenRouter')
        ANTHROPIC = 'anthropic', _('Anthropic')
        OPENAI = 'openai', _('OpenAI')
        AZURE_OPENAI = 'azure_openai', _('Azure OpenAI')
        CUSTOM = 'custom', _('Custom (LiteLLM-compatible)')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='llm_configs',
    )

    name = models.CharField(max_length=255)
    provider = models.CharField(max_length=32, choices=Provider.choices)

    # Encrypted at rest. Field type is identical to vault.Credential.password
    # so an admin who can read the DB sees ciphertext, not plaintext.
    api_key = EncryptedCharField(max_length=1024)

    # LiteLLM-style identifier: provider/model when not OpenAI-shaped,
    # e.g. "gemini/gemini-1.5-flash", "groq/llama-3.1-70b-versatile".
    model_name = models.CharField(max_length=255)

    # Azure OpenAI requires an API version; other providers ignore this.
    api_version = models.CharField(max_length=64, blank=True)

    # For OpenRouter / self-hosted / custom proxies. Leave blank for the
    # provider's own default endpoint.
    base_url = models.URLField(max_length=512, blank=True)

    # Per-config addendum to the global Autobot system prompt. Empty by
    # default; users can use this to specialize the assistant per config
    # ("respond in JSON", "concise answers only", etc.).
    system_instruction = models.TextField(blank=True)

    # At most one default per user — enforced in save() because a partial
    # unique index would be Postgres-specific and overkill for v1.
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'name')
        ordering = ['-modified_at']
        indexes = [
            models.Index(fields=['user', 'is_default']),
        ]
        verbose_name = 'LLM Configuration'
        verbose_name_plural = 'LLM Configurations'
        db_table = 'llm_configs'

    def __str__(self) -> str:
        return f"{self.name} ({self.provider})"

    def save(self, *args, **kwargs):
        # If this row is being saved as default, demote every other default
        # for the same user. Keeps the "max one default per user" invariant
        # without needing a partial unique index or a separate constraint.
        if self.is_default:
            LLMConfig.objects.filter(
                user=self.user, is_default=True,
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


# ── Conversation models ────────────────────────────────────────────────
#
# Authorization model for everything below:
#   • Thread.user is the source of truth. Every queryset that surfaces
#     conversation data MUST filter by `user=request.user` (for Thread
#     itself) or `thread__user=request.user` (for Message / Summary).
#   • Cascading deletes: deleting a user removes their threads → messages →
#     summaries. Deleting a thread removes its messages and summaries.
#   • Deleting an LLMConfig that a thread references is SET_NULL, not
#     CASCADE — we don't want users to inadvertently nuke their chat
#     history by deleting an LLM key. Threads survive and fall back to
#     UserSettings.default_llm_config / admin defaults.
#   • Same SET_NULL applies to UserSettings.default_llm_config.
#
# Field-level safety:
#   • All role / content-type / tone / expertise fields use TextChoices —
#     enum-bound at the schema and serializer layer.
#   • Free-form text fields (custom_instructions, system_prompt_override)
#     are capped well below practical context windows to bound the prompt
#     budget a single user can spend per call.
#   • Idempotency: Message has a per-(thread, client_id) partial unique
#     constraint. The chat endpoint generates a client-supplied UUID, so
#     a retried POST after a dropped SSE stream returns the original row
#     instead of creating a duplicate.


class Thread(models.Model):
    """A single Autobot chat conversation.

    Per-thread `llm_config` is an OPTIONAL override of the user's default
    config (UserSettings.default_llm_config). `system_prompt_override` lets
    the user attach a thread-scoped addendum to the system prompt without
    changing their global preferences. Both are nullable / empty by default.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='autobot_threads',
    )

    # Optional human-set title; the chat UI typically autogenerates one
    # from the first user message and lets the user rename via PATCH.
    title = models.CharField(max_length=255, blank=True)

    # Per-thread LLM override. SET_NULL so deleting an LLMConfig doesn't
    # cascade and destroy chat history — the thread just falls back to
    # the user's default config (or admin defaults) on next message.
    llm_config = models.ForeignKey(
        LLMConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='threads',
    )

    # Thread-scoped addendum to the global system prompt. Capped to bound
    # the prompt budget — see UserSettings.custom_instructions for the
    # global-scoped version.
    system_prompt_override = models.TextField(blank=True, max_length=8000)

    # Soft-delete: archived threads stay in the DB (auditable) but the
    # history sidebar can filter them out by default.
    is_archived = models.BooleanField(default=False)

    # Hot ordering key for the history list — "what did I last work on".
    # Touched by the message-create endpoint. Indexed because
    # the history sidebar query is `... ORDER BY last_message_at DESC LIMIT N`.
    last_message_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        # `-last_message_at NULLS LAST` is the ideal ordering for the sidebar
        # but Django doesn't expose NULLS LAST cleanly across backends; the
        # view layer can override with explicit `.order_by(...)` if needed.
        ordering = ['-last_message_at', '-created_at']
        indexes = [
            # Sidebar query: list a user's threads, most-recent first.
            models.Index(fields=['user', '-last_message_at']),
            # Filter archived vs active threads.
            models.Index(fields=['user', 'is_archived']),
        ]
        db_table = 'autobot_threads'
        verbose_name = 'Autobot Thread'
        verbose_name_plural = 'Autobot Threads'

    def __str__(self) -> str:
        return f"Thread {self.id} ({self.title or 'untitled'})"


class Message(models.Model):
    """A single turn in a Thread.

    Message has NO direct user FK by design — authorization scopes through
    `thread__user`. This mirrors how WorkflowNodeRun scopes through
    `workflow_run__user`. Avoids duplicate-truth and an extra index column.
    """

    class Role(models.TextChoices):
        USER = 'user', _('User')
        ASSISTANT = 'assistant', _('Assistant')
        SYSTEM = 'system', _('System')
        TOOL = 'tool', _('Tool')

    class ContentType(models.TextChoices):
        TEXT = 'text/plain', _('Text')
        MARKDOWN = 'text/markdown', _('Markdown')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(
        Thread, on_delete=models.CASCADE, related_name='messages',
    )

    role = models.CharField(max_length=16, choices=Role.choices)

    # May be empty when an assistant message is purely tool_calls (no prose).
    content = models.TextField(blank=True)
    content_type = models.CharField(
        max_length=32, choices=ContentType.choices, default=ContentType.MARKDOWN,
    )

    # Which provider/model produced this message (populated on assistant turns).
    # Kept here as plain strings — denormalized from LLMConfig — so the
    # history is portable even if the user later deletes the config.
    provider = models.CharField(max_length=32, blank=True)
    model_name = models.CharField(max_length=255, blank=True)

    # Token accounting. Populated by the chat endpoint from LiteLLM's
    # response usage block. Used by the summarizer + future cost UI.
    prompt_tokens = models.PositiveIntegerField(null=True, blank=True)
    completion_tokens = models.PositiveIntegerField(null=True, blank=True)
    total_tokens = models.PositiveIntegerField(null=True, blank=True)

    # LiteLLM-compatible tool-call state.
    #   • tool_calls: list of {id, type, function: {name, arguments}} the
    #     assistant emitted on this turn. Empty list for non-tool turns.
    #   • tool_call_id: present on role='tool' messages, linking the
    #     tool result back to the tool call it answers.
    tool_calls = models.JSONField(default=list, blank=True)
    tool_call_id = models.CharField(max_length=128, blank=True)

    # Idempotency key supplied by the client on POST. When set, a retried
    # POST with the same client_id within the same thread returns the
    # existing Message instead of creating a duplicate — important for
    # SSE streams that die mid-flight and trigger a client retry.
    client_id = models.CharField(max_length=128, blank=True)

    # True when the turn was served from the user's BYO LLMConfig.
    # Distinguishes provider="gemini" via admin pool from provider="gemini"
    # via a user-supplied Gemini key — same provider string, different
    # billing surface. Needed by the dashboard to split tokens into
    # admin vs BYO. Indexed because the dashboard aggregator groups on it.
    is_byo = models.BooleanField(default=False, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            # Primary read pattern: load a thread's messages in order.
            models.Index(fields=['thread', 'created_at']),
            # Secondary: filter a thread's messages by role (e.g. for the
            # summarizer, which only cares about user/assistant turns).
            models.Index(fields=['thread', 'role']),
        ]
        constraints = [
            # Partial unique: enforced ONLY when client_id is non-empty.
            # Lets messages without an idempotency key coexist freely.
            UniqueConstraint(
                fields=['thread', 'client_id'],
                condition=~Q(client_id=''),
                name='unique_autobot_message_client_id_per_thread',
            ),
        ]
        db_table = 'autobot_messages'
        verbose_name = 'Autobot Message'
        verbose_name_plural = 'Autobot Messages'

    def __str__(self) -> str:
        return f"Message {self.id} ({self.role})"


class Summary(models.Model):
    """A rolling summary of older Messages in a Thread.

    Created by the summarizer when the in-memory context grows
    past `AUTOBOT_CONTEXT_TARGET_RATIO * model_context_window`. All messages
    older than `up_to_message` (exclusive of newer ones) are collapsed into
    `summary_text`. Persisted in Postgres so context can be re-hydrated
    from cold Redis without re-summarizing.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(
        Thread, on_delete=models.CASCADE, related_name='summaries',
    )

    # The summary covers all messages with created_at <= up_to_message.created_at.
    # CASCADE because a deleted Message invalidates the summary's boundary.
    # related_name='+' because we never need the reverse traversal.
    up_to_message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name='+',
    )

    summary_text = models.TextField()
    summary_tokens = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Read pattern: "give me the latest summary for this thread".
            models.Index(fields=['thread', '-created_at']),
        ]
        db_table = 'autobot_summaries'
        verbose_name = 'Autobot Summary'
        verbose_name_plural = 'Autobot Summaries'

    def __str__(self) -> str:
        return f"Summary {self.id} for thread {self.thread_id}"


class UserSettings(models.Model):
    """Per-user Autobot preferences."""

    class Expertise(models.TextChoices):
        BEGINNER = 'beginner', _('Beginner')
        INTERMEDIATE = 'intermediate', _('Intermediate')
        EXPERT = 'expert', _('Expert')

    class Tone(models.TextChoices):
        CONCISE = 'concise', _('Concise')
        BALANCED = 'balanced', _('Balanced')
        DETAILED = 'detailed', _('Detailed')

    # OneToOne so there's at most one settings row per user. Cascade so
    # deleting the user wipes their preferences too.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='autobot_settings',
    )

    # User's default BYO LLMConfig. None = use admin defaults from autobot.env.
    # SET_NULL because deleting an LLMConfig shouldn't break the user's
    # entire chat experience — Autobot falls back to admin defaults.
    default_llm_config = models.ForeignKey(
        LLMConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        help_text=(
            "User's preferred BYO config. If None, Autobot falls back to "
            "admin defaults configured in autobot.env."
        ),
    )

    tone = models.CharField(
        max_length=16, choices=Tone.choices, default=Tone.BALANCED,
    )
    expertise = models.CharField(
        max_length=16, choices=Expertise.choices, default=Expertise.INTERMEDIATE,
    )
    # ISO-639-1 language code (e.g. 'en', 'es', 'hi'). Empty = no preference.
    language = models.CharField(max_length=16, default='en')

    # Global system-prompt addendum applied to every thread for this user.
    # Capped to bound the per-call prompt budget; Thread.system_prompt_override
    # stacks on top of this for per-conversation specializations.
    custom_instructions = models.TextField(blank=True, max_length=4000)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'autobot_user_settings'
        verbose_name = 'Autobot User Settings'
        verbose_name_plural = 'Autobot User Settings'

    def __str__(self) -> str:
        return f"Autobot settings for {self.user.username}"


# ── Docs RAG ────────────────────────────────────────────────
#
# DocChunk powers the PUBLIC documentation assistant on the Docusaurus site.
# It is deliberately DIFFERENT from the conversation models above:
#
#   • NO user FK. Documentation is global — identical for every visitor —
#     so the per-user authorization scoping that governs Thread/Message does
#     NOT apply here. Access control happens at the endpoint layer instead:
#     the search view is gated by an internal shared secret (only the autobot
#     service calls it), and the public chat endpoint is IP-throttled +
#     daily-capped + restricted to the single `search_docs` tool.
#   • The source of truth is the markdown in the separate `autosage-docs`
#     repo. Rows here are a derived, re-buildable index — wiped and
#     re-populated by the `ingest_docs` management command. Nothing
#     user-authored lives here, so loss is recoverable by re-ingesting.


class DocChunk(models.Model):
    """A single embedded chunk of the Autosage documentation, for RAG retrieval.

    One source markdown file is split into multiple chunks (by heading, with a
    token cap). Each chunk carries its own embedding so similarity search can
    return the most relevant *section* rather than a whole page.

    Re-ingestion identity is `(source, doc_path, chunk_index)` — the stable
    "slot" a chunk occupies. `content_hash` lets the ingester skip re-embedding
    a slot whose text is unchanged (embedding calls are the expensive step).
    """

    class Source(models.TextChoices):
        DOCS = 'docs', _('Docs')
        TUTORIALS = 'tutorials', _('Tutorials')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Which Docusaurus content plugin this came from. Maps to the routeBasePath
    # in autosage-docs/docusaurus.config.ts (/docs vs /tutorials).
    source = models.CharField(max_length=16, choices=Source.choices)

    # Path of the source markdown file relative to its content root, e.g.
    # "workflows/nodes-and-edges/trigger-nodes.md". Part of the chunk identity.
    doc_path = models.CharField(max_length=512)

    # Human-facing page title (from frontmatter), surfaced to the model + UI.
    title = models.CharField(max_length=512, blank=True)

    # Resolved site URL for this chunk's page (frontmatter slug or derived from
    # source + doc_path). Returned to the model so answers can cite a link.
    url = models.CharField(max_length=1024, blank=True)

    # Breadcrumb of the heading trail this chunk sits under, e.g.
    # "Workflows › Nodes and edges › Trigger nodes". Gives the model context
    # about where in the docs a snippet came from.
    heading_path = models.CharField(max_length=1024, blank=True)

    # The chunk's plain-text content (MDX/JSX stripped). This is what gets
    # embedded and what a snippet is sliced from for the search response.
    content = models.TextField()

    # sha256 of `content`. Drives idempotent re-ingest: unchanged hash → skip
    # the (expensive) embedding call for this slot. Not unique — identical text
    # can legitimately appear in more than one place.
    content_hash = models.CharField(max_length=64)

    # 0-based position of this chunk within its source file.
    chunk_index = models.PositiveIntegerField(default=0)

    # Approximate token count of `content`, recorded at ingest for budgeting.
    token_count = models.PositiveIntegerField(null=True, blank=True)

    # The vector embedding (local fastembed bge-base-en-v1.5, 768-dim). Cosine
    # distance is the search metric — see the HnswIndex below.
    embedding = VectorField(dimensions=DOC_EMBEDDING_DIMENSIONS)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['source', 'doc_path', 'chunk_index']
        indexes = [
            # Re-ingest lookup: "all chunks for this file" when reconciling.
            models.Index(fields=['source', 'doc_path']),
            # Approximate-nearest-neighbour index for cosine similarity search.
            # vector_cosine_ops matches the CosineDistance() used by the search
            # view. Requires the pgvector extension (enabled in migration 0004).
            HnswIndex(
                name='doc_chunk_embedding_hnsw',
                fields=['embedding'],
                m=16,
                ef_construction=64,
                opclasses=['vector_cosine_ops'],
            ),
        ]
        constraints = [
            # A chunk slot is uniquely identified by its position in a file.
            # Lets the ingester update_or_create per slot for idempotent runs.
            UniqueConstraint(
                fields=['source', 'doc_path', 'chunk_index'],
                name='unique_doc_chunk_slot',
            ),
        ]
        db_table = 'autobot_doc_chunks'
        verbose_name = 'Documentation Chunk'
        verbose_name_plural = 'Documentation Chunks'

    def __str__(self) -> str:
        return f"DocChunk {self.source}/{self.doc_path}#{self.chunk_index}"
