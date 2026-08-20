# Milestone 3b — live case persistence

## Storage decision

Production case persistence uses the existing EU-jurisdiction D1 database:

- database: `hvadnu-prod`
- binding: `DB`
- database id: `a7dbc676-17b2-4a91-87c6-a98565d1ee5b`

The D1 binding is repository configuration. The database is empty until the migrations are applied explicitly.

## Migration history

`0001_case_state.sql` is the already-reviewed M3a foundation and remains immutable.

M3b adds `0002_live_document_persistence.sql`, which adds document metadata, page-aware source chunks and a nullable `source_occurred_at` field. The existing non-null `occurred_at` remains the internal event/import timestamp. This keeps unknown source dates genuinely unknown instead of relabeling import time as document chronology.

## Persistence boundary

Document handling has three separate user-visible stages:

1. local extraction in the browser;
2. explicit Sonnet analysis;
3. explicit **Gem i sagen** persistence.

Analysis never implies persistence. `synthetic_demo` explanations are rejected by both client and server persistence paths.

M3b stores:

- extracted document text as bounded page-aware chunks;
- SHA-256 of the complete extracted text;
- document metadata;
- the already validated structured model analysis;
- one source-linked timeline event.

Original PDF/DOCX/file bytes are not stored in M3b.

Source chunks are capped at 12,000 characters. This avoids large-row edge cases in D1 and creates the retrieval unit that can later receive FTS5 indexing without rewriting persisted documents.

A document import does **not** create or confirm current-state entries. Unknown document dates remain `NULL` in `source_occurred_at`; import time is not presented as the source/event date.

## Authentication

Every case read/write/export/delete route uses the same verified Cloudflare Access identity boundary as document analysis. Authentication is checked before request body parsing or D1 work.

Routes:

- `GET /api/case`
- `POST /api/case/import-document`
- `GET /api/case/export`
- `DELETE /api/case/delete`

Responses use `Cache-Control: no-store` and payload content is not logged by application code.

## Data control

The Sagen view exposes explicit full JSON export and full-case deletion. Export includes all persisted source chunks and validated analysis JSON. Deleting the case cascades through chunks, sources, timeline links and current-state relations.

## Production migration gate

Do not merge/deploy the D1-bound Worker before the empty production database has all pending migrations applied.

From the M3b branch at repository root:

```bash
npx wrangler d1 migrations apply hvadnu-prod --remote
```

Wrangler should apply `0001_case_state.sql` followed by `0002_live_document_persistence.sql` on the currently empty database.

Then verify tables and migration history:

```bash
npx wrangler d1 execute hvadnu-prod --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

```bash
npx wrangler d1 execute hvadnu-prod --remote --command "SELECT name FROM d1_migrations ORDER BY id;"
```

Finally verify that no case content exists before promotion:

```bash
npx wrangler d1 execute hvadnu-prod --remote --command "SELECT (SELECT COUNT(*) FROM cases) AS cases, (SELECT COUNT(*) FROM case_sources) AS sources;"
```

Expected case/source counts are both zero. Only after the schema and empty state are verified should M3b be promoted to `main`.

## Next step

M3c will derive source-backed current-state candidates as a separate operation. AI output remains candidate-only; promotion to confirmed current state requires explicit user confirmation or a reviewed deterministic rule.
