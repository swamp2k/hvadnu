import { CaseSnapshotSchema, type CaseSnapshot, type CaseTimelineEvent } from '../domain/case-state';
import { CurrentStateEntrySchema, type CurrentStateEntry } from '../domain/current-state';
import type { DocumentExplanation, ExtractedDocument } from '../domain/document';
import type { D1Database } from './d1-types';

export const PRIMARY_CASE_ID = 'primary-case';

interface TimelineRow {
  id: string;
  occurred_at: string | null;
  kind: CaseTimelineEvent['kind'];
  title: string;
  summary: string;
  topic: string;
  disputed: number;
}

interface TimelineSourceRow {
  event_id: string;
  source_id: string;
}

interface StateRow {
  id: string;
  topic: string;
  summary: string;
  authority: CurrentStateEntry['authority'];
  status: CurrentStateEntry['status'];
  proposed_by: CurrentStateEntry['proposedBy'];
  confirmed_by: CurrentStateEntry['confirmedBy'] | null;
}

interface StateSourceRow {
  entry_id: string;
  source_id: string;
  page: number | null;
  message_id: string | null;
  excerpt: string | null;
}

interface SupersedesRow {
  entry_id: string;
  superseded_entry_id: string;
}

export interface PersistedCaseSource {
  id: string;
  label: string;
  sourceType: string;
  occurredAt: string | null;
  immutableSha256: string | null;
  mimeType: string | null;
  documentKind: string | null;
  sizeBytes: number | null;
  characterCount: number | null;
  sourceText: string | null;
  analysisJson: string | null;
  createdAt: string;
}

interface SourceRow {
  id: string;
  label: string;
  source_type: string;
  occurred_at: string | null;
  immutable_sha256: string | null;
  mime_type: string | null;
  document_kind: string | null;
  size_bytes: number | null;
  character_count: number | null;
  source_text: string | null;
  analysis_json: string | null;
  created_at: string;
}

export interface CaseExport {
  exportedAt: string;
  snapshot: CaseSnapshot;
  sources: PersistedCaseSource[];
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function textFor(document: ExtractedDocument): string {
  return document.pages.map((page) => page.text).join('\n\n');
}

function mapSource(row: SourceRow): PersistedCaseSource {
  return {
    id: row.id,
    label: row.label,
    sourceType: row.source_type,
    occurredAt: row.occurred_at,
    immutableSha256: row.immutable_sha256,
    mimeType: row.mime_type,
    documentKind: row.document_kind,
    sizeBytes: row.size_bytes,
    characterCount: row.character_count,
    sourceText: row.source_text,
    analysisJson: row.analysis_json,
    createdAt: row.created_at,
  };
}

export class D1CaseRepository {
  constructor(private readonly db: D1Database, private readonly caseId = PRIMARY_CASE_ID) {}

  async importAnalyzedDocument(document: ExtractedDocument, explanation: DocumentExplanation): Promise<{ sourceId: string; eventId: string }> {
    if (explanation.mode !== 'model_analysis') throw new Error('model_analysis_required');

    const now = new Date().toISOString();
    const sourceId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const sourceText = textFor(document);
    const immutableSha256 = await sha256Hex(sourceText);

    const statements = [
      this.db.prepare('INSERT OR IGNORE INTO cases (id, created_at, updated_at) VALUES (?, ?, ?)').bind(this.caseId, now, now),
      this.db.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').bind(now, this.caseId),
      this.db.prepare(`INSERT INTO case_sources (
        id, case_id, source_type, label, occurred_at, immutable_sha256,
        mime_type, document_kind, size_bytes, character_count, source_text, analysis_json, created_at
      ) VALUES (?, ?, 'document', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          sourceId,
          this.caseId,
          document.name,
          immutableSha256,
          document.mimeType,
          document.kind,
          document.sizeBytes,
          sourceText.length,
          sourceText,
          JSON.stringify(explanation),
          now,
        ),
      this.db.prepare(`INSERT INTO case_timeline_events (
        id, case_id, occurred_at, kind, topic, title, summary, disputed, created_at
      ) VALUES (?, ?, NULL, 'document', 'document_import', ?, ?, ?, ?)`)
        .bind(
          eventId,
          this.caseId,
          explanation.title,
          explanation.summary,
          explanation.sourceStatus === 'disputed' ? 1 : 0,
          now,
        ),
      this.db.prepare('INSERT INTO timeline_event_sources (case_id, event_id, source_id) VALUES (?, ?, ?)')
        .bind(this.caseId, eventId, sourceId),
    ];

    const results = await this.db.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('d1_import_failed');
    return { sourceId, eventId };
  }

  async getSnapshot(): Promise<CaseSnapshot> {
    const caseRow = await this.db.prepare('SELECT id, updated_at FROM cases WHERE id = ?').bind(this.caseId).first<{ id: string; updated_at: string }>();
    if (!caseRow) {
      return CaseSnapshotSchema.parse({ caseId: this.caseId, generatedAt: new Date().toISOString(), timeline: [], currentState: [] });
    }

    const [timelineResult, timelineSourcesResult, stateResult, stateSourcesResult, supersedesResult] = await Promise.all([
      this.db.prepare(`SELECT id, occurred_at, kind, title, summary, topic, disputed
        FROM case_timeline_events WHERE case_id = ?
        ORDER BY CASE WHEN occurred_at IS NULL THEN 1 ELSE 0 END, occurred_at DESC, created_at DESC`)
        .bind(this.caseId).all<TimelineRow>(),
      this.db.prepare('SELECT event_id, source_id FROM timeline_event_sources WHERE case_id = ?').bind(this.caseId).all<TimelineSourceRow>(),
      this.db.prepare(`SELECT id, topic, summary, authority, status, proposed_by, confirmed_by
        FROM current_state_entries WHERE case_id = ? ORDER BY updated_at DESC`)
        .bind(this.caseId).all<StateRow>(),
      this.db.prepare(`SELECT entry_id, source_id, page, message_id, excerpt
        FROM current_state_sources WHERE case_id = ? ORDER BY entry_id, source_id, locator_key`)
        .bind(this.caseId).all<StateSourceRow>(),
      this.db.prepare('SELECT entry_id, superseded_entry_id FROM current_state_supersedes WHERE case_id = ?')
        .bind(this.caseId).all<SupersedesRow>(),
    ]);

    const timelineSources = new Map<string, string[]>();
    for (const row of timelineSourcesResult.results ?? []) {
      const ids = timelineSources.get(row.event_id) ?? [];
      ids.push(row.source_id);
      timelineSources.set(row.event_id, ids);
    }

    const sourceRefs = new Map<string, Array<{ sourceId: string; page?: number; messageId?: string; excerpt?: string }>>();
    for (const row of stateSourcesResult.results ?? []) {
      const refs = sourceRefs.get(row.entry_id) ?? [];
      refs.push({
        sourceId: row.source_id,
        ...(row.page === null ? {} : { page: row.page }),
        ...(row.message_id === null ? {} : { messageId: row.message_id }),
        ...(row.excerpt === null ? {} : { excerpt: row.excerpt }),
      });
      sourceRefs.set(row.entry_id, refs);
    }

    const supersedes = new Map<string, string[]>();
    for (const row of supersedesResult.results ?? []) {
      const ids = supersedes.get(row.entry_id) ?? [];
      ids.push(row.superseded_entry_id);
      supersedes.set(row.entry_id, ids);
    }

    const timeline = (timelineResult.results ?? []).map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      sourceIds: timelineSources.get(row.id) ?? [],
      topic: row.topic,
      disputed: row.disputed === 1,
    }));

    const currentState = (stateResult.results ?? []).map((row) => CurrentStateEntrySchema.parse({
      id: row.id,
      topic: row.topic,
      summary: row.summary,
      authority: row.authority,
      status: row.status,
      sourceRefs: sourceRefs.get(row.id) ?? [],
      supersedesEntryIds: supersedes.get(row.id) ?? [],
      proposedBy: row.proposed_by,
      ...(row.confirmed_by === null ? {} : { confirmedBy: row.confirmed_by }),
    }));

    return CaseSnapshotSchema.parse({
      caseId: this.caseId,
      generatedAt: caseRow.updated_at,
      timeline,
      currentState,
    });
  }

  async exportCase(): Promise<CaseExport> {
    const snapshot = await this.getSnapshot();
    const result = await this.db.prepare(`SELECT id, label, source_type, occurred_at, immutable_sha256,
      mime_type, document_kind, size_bytes, character_count, source_text, analysis_json, created_at
      FROM case_sources WHERE case_id = ? ORDER BY created_at ASC`)
      .bind(this.caseId).all<SourceRow>();
    return {
      exportedAt: new Date().toISOString(),
      snapshot,
      sources: (result.results ?? []).map(mapSource),
    };
  }

  async deleteCase(): Promise<void> {
    const result = await this.db.prepare('DELETE FROM cases WHERE id = ?').bind(this.caseId).run();
    if (!result.success) throw new Error('d1_delete_failed');
  }
}
