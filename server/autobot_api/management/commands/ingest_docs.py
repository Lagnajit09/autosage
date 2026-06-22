"""Ingest the autosage-docs Docusaurus content into the DocChunk vector store.

Reads the `docs/` and `tutorials/` markdown trees, strips MDX noise, chunks by
heading (bounded to the embedding model's input limit), embeds each chunk
locally (fastembed), and writes them to Postgres/pgvector.

Runs INSIDE Django, so it writes DocChunk rows directly — a management command
is part of the Django control plane, so this does not violate "autobot never
writes the schema" (autobot is the separate FastAPI service).

Idempotent: each source (docs / tutorials) is wiped and reloaded in a single
transaction, so re-running picks up edits, renames, and deletions automatically.
At ~24 files re-embedding everything takes seconds; the content_hash field is
populated for a future skip-unchanged optimization.

Usage:
    python manage.py ingest_docs --docs-path /path/to/autosage-docs
    python manage.py ingest_docs --source docs --dry-run
"""

from __future__ import annotations

import hashlib
import os
import re

import frontmatter
from django.conf import settings as django_settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from autobot_api import embeddings
from autobot_api.models import DOC_CHUNK_MAX_CHARS, DocChunk

# Routes match docusaurus.config.ts: docs preset routeBasePath "/docs",
# tutorials plugin routeBasePath "/tutorials".
_SOURCE_ROUTE = {
    DocChunk.Source.DOCS: '/docs',
    DocChunk.Source.TUTORIALS: '/tutorials',
}

# Overlap (chars) carried between sub-chunks when a section is split, so a fact
# straddling a boundary survives in at least one chunk.
_CHUNK_OVERLAP_CHARS = 200

_FENCE_RE = re.compile(r'^\s*(```|~~~)')
_HEADING_RE = re.compile(r'^(#{1,6})\s+(.+?)\s*#*\s*$')
_IMPORT_EXPORT_RE = re.compile(r'^\s*(import|export)\s')
_ADMONITION_RE = re.compile(r'^\s*:::')          # :::tip / :::note / closing :::
_HTML_COMMENT_RE = re.compile(r'<!--.*?-->', re.DOTALL)
_TAG_RE = re.compile(r'<[^>]+>')                 # JSX / HTML tags
_BLANK_RUN_RE = re.compile(r'\n{3,}')


# ── Pure helpers (no DB / no Django model access) ──────────────────────────


def clean_mdx(body: str) -> str:
    """Strip MDX/JSX noise while preserving prose, headings, and code blocks.

    Operates line-by-line and leaves anything inside a fenced code block
    untouched (so a `#` comment or a `<` in code is never misread).
    """
    body = _HTML_COMMENT_RE.sub('', body)
    out: list[str] = []
    in_code = False
    for line in body.splitlines():
        if _FENCE_RE.match(line):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            out.append(line)
            continue
        if _IMPORT_EXPORT_RE.match(line):
            continue
        if _ADMONITION_RE.match(line):  # drop the fence marker, keep inner text
            continue
        out.append(_TAG_RE.sub('', line))
    text = '\n'.join(out)
    return _BLANK_RUN_RE.sub('\n\n', text).strip()


def _split_oversized(text: str) -> list[str]:
    """Split a too-long section into <=DOC_CHUNK_MAX_CHARS pieces with overlap."""
    if len(text) <= DOC_CHUNK_MAX_CHARS:
        return [text]
    paras = re.split(r'\n\s*\n', text)
    pieces: list[str] = []
    cur = ''
    for para in paras:
        para = para.strip()
        if not para:
            continue
        # A single paragraph larger than the cap: hard-split by chars.
        if len(para) > DOC_CHUNK_MAX_CHARS:
            if cur:
                pieces.append(cur)
                cur = ''
            start = 0
            while start < len(para):
                pieces.append(para[start:start + DOC_CHUNK_MAX_CHARS])
                start += DOC_CHUNK_MAX_CHARS - _CHUNK_OVERLAP_CHARS
            continue
        candidate = f'{cur}\n\n{para}' if cur else para
        if len(candidate) > DOC_CHUNK_MAX_CHARS:
            pieces.append(cur)
            overlap = cur[-_CHUNK_OVERLAP_CHARS:] if len(cur) > _CHUNK_OVERLAP_CHARS else ''
            cur = f'{overlap}\n\n{para}' if overlap else para
        else:
            cur = candidate
    if cur:
        pieces.append(cur)
    return pieces


def chunk_markdown(body: str, page_title: str) -> list[tuple[str, str]]:
    """Split cleaned markdown into (heading_path, content) chunks.

    Sections break on H1/H2 (top level, resets the H3) and H3 (sub level).
    H4-H6 stay inline. Each section is further split if it exceeds the char cap.
    heading_path is a breadcrumb: "Page Title › Section › Subsection".
    """
    h2: str | None = None
    h3: str | None = None
    chunks: list[tuple[str, str]] = []
    buf: list[str] = []
    in_code = False

    def heading_path() -> str:
        return ' › '.join(p for p in (page_title, h2, h3) if p)

    def flush():
        text = '\n'.join(buf).strip()
        buf.clear()
        if not text:
            return
        hp = heading_path()
        for piece in _split_oversized(text):
            piece = piece.strip()
            if piece:
                chunks.append((hp, piece))

    for line in body.splitlines():
        if _FENCE_RE.match(line):
            in_code = not in_code
            buf.append(line)
            continue
        m = None if in_code else _HEADING_RE.match(line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level <= 2:
                flush()
                h2, h3 = text, None
            elif level == 3:
                flush()
                h3 = text
            else:
                buf.append(line)  # H4-H6: keep inline
            continue
        buf.append(line)
    flush()
    return chunks


def resolve_url(source: str, rel_path: str, meta: dict) -> str:
    """Best-effort site URL for a doc, for citation links in answers.

    Honors a frontmatter `slug` (absolute or relative to the route base);
    otherwise derives from the file path. index/README files map to their dir.
    """
    base = _SOURCE_ROUTE.get(source, f'/{source}')
    slug = meta.get('slug')
    if slug:
        slug = str(slug)
        path = slug if slug.startswith('/') else f'/{slug}'
        url = f'{base}{path}'
    else:
        rel = rel_path.replace(os.sep, '/')
        rel = re.sub(r'\.mdx?$', '', rel)
        rel = re.sub(r'/(index|README)$', '', rel, flags=re.IGNORECASE)
        url = f'{base}/{rel}' if rel else base
    return re.sub(r'/{2,}', '/', url).rstrip('/') or base


def _iter_markdown_files(root: str):
    """Yield (rel_path, abs_path) for every .md/.mdx under root, sorted."""
    for dirpath, _dirs, files in os.walk(root):
        for name in sorted(files):
            if name.endswith(('.md', '.mdx')):
                abs_path = os.path.join(dirpath, name)
                yield os.path.relpath(abs_path, root), abs_path


def build_chunks_for_source(source: str, source_root: str) -> list[dict]:
    """Parse every file under a source root into chunk dicts (no embedding yet)."""
    rows: list[dict] = []
    for rel_path, abs_path in _iter_markdown_files(source_root):
        with open(abs_path, 'r', encoding='utf-8') as fh:
            post = frontmatter.load(fh)
        meta = post.metadata or {}
        title = str(meta.get('title') or '').strip()
        url = resolve_url(source, rel_path, meta)
        cleaned = clean_mdx(post.content)
        # chunk_index is 0-based WITHIN each file — the slot identity is
        # (source, doc_path, chunk_index). Reset per file.
        for index, (heading_path, content) in enumerate(chunk_markdown(cleaned, title)):
            rows.append({
                'source': source,
                'doc_path': rel_path.replace(os.sep, '/'),
                'title': title,
                'url': url,
                'heading_path': heading_path[:1024],
                'content': content,
                'content_hash': hashlib.sha256(content.encode('utf-8')).hexdigest(),
                'chunk_index': index,
                'token_count': max(1, len(content) // 4),  # rough char/4 estimate
            })
    return rows


# ── Command ─────────────────────────────────────────────────────────────────


class Command(BaseCommand):
    help = 'Ingest autosage-docs markdown into the DocChunk pgvector store.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--docs-path',
            default=getattr(django_settings, 'AUTOSAGE_DOCS_PATH', '') or '',
            help='Path to the autosage-docs repo root (contains docs/ and tutorials/).',
        )
        parser.add_argument(
            '--source',
            choices=['docs', 'tutorials', 'all'],
            default='all',
            help='Which content tree to ingest (default: all).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Parse and report chunk counts without embedding or writing.',
        )

    def handle(self, *args, **options):
        docs_path = (options['docs_path'] or '').strip()
        if not docs_path:
            raise CommandError(
                'No docs path. Pass --docs-path or set AUTOSAGE_DOCS_PATH.'
            )
        if not os.path.isdir(docs_path):
            raise CommandError(f'Docs path is not a directory: {docs_path}')

        chosen = (
            [DocChunk.Source.DOCS, DocChunk.Source.TUTORIALS]
            if options['source'] == 'all'
            else [options['source']]
        )
        dry_run = options['dry_run']
        total_written = 0

        for source in chosen:
            source_root = os.path.join(docs_path, source)
            if not os.path.isdir(source_root):
                self.stdout.write(self.style.WARNING(
                    f'[{source}] directory not found at {source_root} — skipping.'
                ))
                continue

            rows = build_chunks_for_source(source, source_root)
            self.stdout.write(
                f'[{source}] parsed {len(rows)} chunk(s) from {source_root}'
            )
            if dry_run:
                for r in rows:
                    self.stdout.write(
                        f'  - {r["doc_path"]}#{r["chunk_index"]} '
                        f'({len(r["content"])} chars) :: {r["heading_path"]}'
                    )
                continue
            if not rows:
                # Still wipe so a now-empty source doesn't keep stale rows.
                with transaction.atomic():
                    DocChunk.objects.filter(source=source).delete()
                continue

            vectors = embeddings.embed_passages([r['content'] for r in rows])
            objs = [
                DocChunk(embedding=vectors[i], **rows[i])
                for i in range(len(rows))
            ]
            with transaction.atomic():
                DocChunk.objects.filter(source=source).delete()
                DocChunk.objects.bulk_create(objs)
            total_written += len(objs)
            self.stdout.write(self.style.SUCCESS(
                f'[{source}] wrote {len(objs)} chunk(s).'
            ))

        if dry_run:
            self.stdout.write(self.style.SUCCESS('Dry run complete (nothing written).'))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Ingestion complete — {total_written} chunk(s) written.'
            ))
