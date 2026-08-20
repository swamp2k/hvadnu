from pathlib import Path
import sqlite3

SQL = Path("migrations/0001_case_state.sql").read_text(encoding="utf-8")
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")
connection.executescript(SQL)

expected_tables = {
    "cases",
    "case_sources",
    "case_source_chunks",
    "case_timeline_events",
    "timeline_event_sources",
    "current_state_entries",
    "current_state_sources",
    "current_state_supersedes",
}
actual_tables = {
    row[0]
    for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    if not row[0].startswith("sqlite_")
}
missing = expected_tables - actual_tables
if missing:
    raise AssertionError(f"Missing migration tables: {sorted(missing)}")

connection.execute("INSERT INTO cases (id, created_at, updated_at) VALUES ('case-a', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
connection.execute("INSERT INTO cases (id, created_at, updated_at) VALUES ('case-b', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
connection.execute("""
    INSERT INTO case_sources (
        id, case_id, source_type, label, occurred_at, immutable_sha256,
        mime_type, document_kind, size_bytes, character_count, analysis_json, created_at
    ) VALUES ('source-a', 'case-a', 'document', 'Synthetic source', NULL, 'hash',
              'text/plain', 'text', 10, 10, '{}', '2026-01-01T00:00:00Z')
""")
connection.execute("INSERT INTO case_source_chunks (case_id, source_id, chunk_index, page_number, text) VALUES ('case-a', 'source-a', 0, 1, 'synthetic text')")
connection.execute("""
    INSERT INTO case_timeline_events (
        id, case_id, occurred_at, kind, topic, title, summary, disputed, created_at
    ) VALUES ('event-b', 'case-b', NULL, 'document', 'test', 'Synthetic event',
              'Synthetic summary', 0, '2026-01-01T00:00:00Z')
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

print("D1 migration invariants validated")
