PRAGMA foreign_keys = ON;

CREATE VIRTUAL TABLE IF NOT EXISTS case_source_fts USING fts5(
  case_id UNINDEXED,
  source_id UNINDEXED,
  chunk_index UNINDEXED,
  text,
  tokenize = 'unicode61'
);

INSERT INTO case_source_fts (case_id, source_id, chunk_index, text)
SELECT c.case_id, c.source_id, c.chunk_index, c.text
FROM case_source_chunks c
WHERE NOT EXISTS (
  SELECT 1 FROM case_source_fts f
  WHERE f.case_id = c.case_id AND f.source_id = c.source_id AND f.chunk_index = c.chunk_index
);

CREATE TRIGGER IF NOT EXISTS trg_case_source_chunks_fts_insert
AFTER INSERT ON case_source_chunks
BEGIN
  INSERT INTO case_source_fts (case_id, source_id, chunk_index, text)
  VALUES (NEW.case_id, NEW.source_id, NEW.chunk_index, NEW.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_case_source_chunks_fts_delete
AFTER DELETE ON case_source_chunks
BEGIN
  DELETE FROM case_source_fts
  WHERE case_id = OLD.case_id AND source_id = OLD.source_id AND chunk_index = OLD.chunk_index;
END;

CREATE TRIGGER IF NOT EXISTS trg_case_source_chunks_fts_update
AFTER UPDATE OF text ON case_source_chunks
BEGIN
  DELETE FROM case_source_fts
  WHERE case_id = OLD.case_id AND source_id = OLD.source_id AND chunk_index = OLD.chunk_index;
  INSERT INTO case_source_fts (case_id, source_id, chunk_index, text)
  VALUES (NEW.case_id, NEW.source_id, NEW.chunk_index, NEW.text);
END;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('message_analysis', 'message_review', 'document_analysis')),
  model TEXT NOT NULL,
  effort TEXT NOT NULL CHECK (effort IN ('medium', 'high')),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cache_creation_input_tokens INTEGER NOT NULL CHECK (cache_creation_input_tokens >= 0),
  cache_read_input_tokens INTEGER NOT NULL CHECK (cache_read_input_tokens >= 0),
  thinking_tokens INTEGER NOT NULL CHECK (thinking_tokens >= 0),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  context_characters INTEGER NOT NULL CHECK (context_characters >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_case_created
  ON ai_usage_events(case_id, created_at DESC);
