PRAGMA foreign_keys = ON;

-- The simplified product no longer maintains a local legal corpus.
-- User messages/documents, web-source snapshots and all case data are untouched.
DROP TRIGGER IF EXISTS trg_legal_references_fts_insert;
DROP TRIGGER IF EXISTS trg_legal_references_fts_delete;
DROP TRIGGER IF EXISTS trg_legal_references_fts_update;
DROP TABLE IF EXISTS legal_reference_fts;
DROP TABLE IF EXISTS legal_references;
