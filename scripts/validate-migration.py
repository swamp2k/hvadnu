from pathlib import Path
import sqlite3

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")

migration_files = sorted(Path("migrations").glob("*.sql"))
if not migration_files:
    raise AssertionError("No D1 migrations found")
for migration in migration_files:
    connection.executescript(migration.read_text(encoding="utf-8"))

expected_tables = {
    "cases",
    "case_sources",
    "case_source_chunks",
    "case_timeline_events",
    "timeline_event_sources",
    "current_state_entries",
    "current_state_sources",
    "current_state_supersedes",
    "case_source_fts",
    "ai_usage_events",
    "legal_references",
    "legal_reference_fts",
    "message_web_sources",
}
actual_tables = {
    row[0]
    for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    if not row[0].startswith("sqlite_")
}
missing = expected_tables - actual_tables
if missing:
    raise AssertionError(f"Missing migration tables: {sorted(missing)}")

source_columns = {row[1] for row in connection.execute("PRAGMA table_info(case_sources)")}
for column in {"mime_type", "document_kind", "size_bytes", "character_count", "analysis_json"}:
    if column not in source_columns:
        raise AssertionError(f"Missing case_sources column: {column}")

timeline_columns = {row[1] for row in connection.execute("PRAGMA table_info(case_timeline_events)")}
if "source_occurred_at" not in timeline_columns:
    raise AssertionError("Missing source_occurred_at timeline column")

legal_columns = {row[1] for row in connection.execute("PRAGMA table_info(legal_references)")}
if "content_kind" not in legal_columns:
    raise AssertionError("Legal references do not distinguish curated summaries from verbatim excerpts")
legal_count = connection.execute("SELECT COUNT(*) FROM legal_references WHERE active = 1").fetchone()[0]
if legal_count < 8:
    raise AssertionError(f"Legal reference library was not populated: {legal_count}")
if connection.execute("SELECT COUNT(*) FROM legal_references WHERE content_kind != 'curated_summary'").fetchone()[0] != 0:
    raise AssertionError("Seeded legal text unexpectedly claims to be verbatim")
legal_match = connection.execute("""
    SELECT reference_id FROM legal_reference_fts
    WHERE legal_reference_fts MATCH 'samvær'
    LIMIT 1
""").fetchone()
if legal_match is None:
    raise AssertionError("Legal reference FTS was not populated")

connection.execute("INSERT INTO cases (id, created_at, updated_at) VALUES ('case-a', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
connection.execute("INSERT INTO cases (id, created_at, updated_at) VALUES ('case-b', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
connection.execute("""
    INSERT INTO case_sources (
        id, case_id, source_type, label, occurred_at, immutable_sha256,
        mime_type, document_kind, size_bytes, character_count, analysis_json, created_at
    ) VALUES ('source-a', 'case-a', 'message', 'Synthetic source', NULL, 'hash',
              'text/plain', 'message', 10, 10, '{}', '2026-01-01T00:00:00Z')
""")
connection.execute("INSERT INTO case_source_chunks (case_id, source_id, chunk_index, page_number, text) VALUES ('case-a', 'source-a', 0, NULL, 'synthetic samvaer torsdag text')")
connection.execute("""
    INSERT INTO message_web_sources (
        case_id, message_source_id, source_id, url, title, source_type, cited_text, created_at
    ) VALUES ('case-a', 'source-a', 'web:1', 'https://www.domstol.dk/synthetic',
              'Synthetic official source', 'web_official', 'Synthetic cited public text', '2026-01-01T00:00:00Z')
""")
connection.execute("""
    INSERT INTO case_timeline_events (
        id, case_id, occurred_at, source_occurred_at, kind, topic, title, summary, disputed, created_at
    ) VALUES ('event-b', 'case-b', '2026-01-01T00:00:00Z', NULL, 'document', 'test',
              'Synthetic event', 'Synthetic summary', 0, '2026-01-01T00:00:00Z')
""")

fts_match = connection.execute("""
    SELECT source_id FROM case_source_fts
    WHERE case_source_fts MATCH 'samvaer' AND case_id = 'case-a'
""").fetchone()
if fts_match is None or fts_match[0] != 'source-a':
    raise AssertionError("FTS trigger did not index inserted source chunk")

connection.execute("""
    INSERT INTO ai_usage_events (
        id, case_id, task_type, model, effort, input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens, thinking_tokens,
        latency_ms, context_characters, created_at
    ) VALUES ('usage-a', 'case-a', 'message_analysis', 'claude-sonnet-5', 'medium',
              100, 20, 0, 0, 5, 10, 200, '2026-01-01T00:00:00Z')
""")
connection.execute("""
    INSERT INTO ai_usage_events (
        id, case_id, task_type, model, effort, input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens, thinking_tokens,
        latency_ms, context_characters, created_at
    ) VALUES ('usage-web', 'case-a', 'web_research', 'claude-sonnet-5', 'medium',
              120, 10, 0, 0, 0, 12, 240, '2026-01-01T00:00:00Z')
""")

try:
    connection.execute("INSERT INTO timeline_event_sources (case_id, event_id, source_id) VALUES ('case-b', 'event-b', 'source-a')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Cross-case source linkage was accepted")

try:
    connection.execute("""
        INSERT INTO current_state_entries (
            id, case_id, topic, summary, authority, status, proposed_by, confirmed_by,
            created_at, updated_at
        ) VALUES ('state-invalid', 'case-a', 'test', 'Synthetic state', 'unknown',
                  'confirmed', 'ai', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
    """)
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Confirmed state without non-AI confirmer was accepted")

connection.execute("""
    INSERT INTO current_state_entries (
        id, case_id, topic, summary, authority, status, proposed_by, confirmed_by,
        created_at, updated_at
    ) VALUES ('state-a', 'case-a', 'test', 'Synthetic candidate', 'unknown',
              'candidate', 'ai', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
""")
try:
    connection.execute("INSERT INTO current_state_supersedes (case_id, entry_id, superseded_entry_id) VALUES ('case-a', 'state-a', 'state-a')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Self-supersession was accepted")

connection.execute("DELETE FROM cases WHERE id = 'case-a'")
if connection.execute("SELECT COUNT(*) FROM case_sources WHERE case_id = 'case-a'").fetchone()[0] != 0:
    raise AssertionError("Case source cascade failed")
if connection.execute("SELECT COUNT(*) FROM case_source_chunks WHERE case_id = 'case-a'").fetchone()[0] != 0:
    raise AssertionError("Source chunk cascade failed")
if connection.execute("SELECT COUNT(*) FROM message_web_sources WHERE case_id = 'case-a'").fetchone()[0] != 0:
    raise AssertionError("Web evidence cascade failed")
if connection.execute("SELECT COUNT(*) FROM ai_usage_events WHERE case_id = 'case-a'").fetchone()[0] != 0:
    raise AssertionError("AI usage cascade failed")
if connection.execute("SELECT COUNT(*) FROM case_source_fts WHERE case_id = 'case-a'").fetchone()[0] != 0:
    raise AssertionError("FTS cleanup trigger failed")
if connection.execute("SELECT COUNT(*) FROM legal_references").fetchone()[0] != legal_count:
    raise AssertionError("Deleting a case unexpectedly changed global legal references")

print(f"D1 migration invariants validated across {len(migration_files)} migrations")
