PRAGMA foreign_keys = ON;

ALTER TABLE case_sources ADD COLUMN mime_type TEXT;
ALTER TABLE case_sources ADD COLUMN document_kind TEXT;
ALTER TABLE case_sources ADD COLUMN size_bytes INTEGER;
ALTER TABLE case_sources ADD COLUMN character_count INTEGER;
ALTER TABLE case_sources ADD COLUMN analysis_json TEXT;

CREATE TABLE IF NOT EXISTS case_source_chunks (
  case_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  page_number INTEGER CHECK (page_number IS NULL OR page_number > 0),
  text TEXT NOT NULL CHECK (length(text) > 0),
  PRIMARY KEY (case_id, source_id, chunk_index),
  FOREIGN KEY (case_id, source_id) REFERENCES case_sources(case_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_source_chunks_source
  ON case_source_chunks(case_id, source_id, chunk_index);

ALTER TABLE case_timeline_events ADD COLUMN source_occurred_at TEXT;

-- Existing M3a rows, if any, used occurred_at as the actual source/event date.
-- Preserve that semantic when upgrading an existing database.
UPDATE case_timeline_events
SET source_occurred_at = occurred_at
WHERE source_occurred_at IS NULL;
