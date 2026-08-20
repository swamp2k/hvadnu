PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_sources (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  label TEXT NOT NULL,
  occurred_at TEXT,
  immutable_sha256 TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_sources_case_id ON case_sources(case_id);

CREATE TABLE IF NOT EXISTS case_timeline_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('document','message','agreement','decision','proposal','claim','deadline')),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  disputed INTEGER NOT NULL DEFAULT 0 CHECK (disputed IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_case_date ON case_timeline_events(case_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS timeline_event_sources (
  event_id TEXT NOT NULL REFERENCES case_timeline_events(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES case_sources(id) ON DELETE RESTRICT,
  PRIMARY KEY (event_id, source_id)
);

CREATE TABLE IF NOT EXISTS current_state_entries (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  authority TEXT NOT NULL CHECK (authority IN ('court_or_authority_decision','signed_party_agreement','confirmed_party_agreement','lawyer_position','party_claim','unknown')),
  status TEXT NOT NULL CHECK (status IN ('candidate','confirmed','rejected','superseded')),
  proposed_by TEXT NOT NULL CHECK (proposed_by IN ('ai','deterministic_rule','user')),
  confirmed_by TEXT CHECK (confirmed_by IN ('deterministic_rule','user')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status != 'confirmed' OR confirmed_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_current_state_case_topic ON current_state_entries(case_id, topic);

CREATE TABLE IF NOT EXISTS current_state_sources (
  entry_id TEXT NOT NULL REFERENCES current_state_entries(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES case_sources(id) ON DELETE RESTRICT,
  page INTEGER,
  message_id TEXT,
  excerpt TEXT,
  PRIMARY KEY (entry_id, source_id, page, message_id)
);

CREATE TABLE IF NOT EXISTS current_state_supersedes (
  entry_id TEXT NOT NULL REFERENCES current_state_entries(id) ON DELETE CASCADE,
  superseded_entry_id TEXT NOT NULL REFERENCES current_state_entries(id) ON DELETE RESTRICT,
  PRIMARY KEY (entry_id, superseded_entry_id)
);
