import { MessageAnalysisResultSchema, MessageHistoryEntrySchema, type MessageAnalysisResult, type MessageHistoryEntry } from '../domain/message-result';
import { D1CaseRepository, PRIMARY_CASE_ID, sha256Hex } from './d1-case-repository';
import type { D1Database } from './d1-types';

const MAX_CONTEXT_CHARACTERS = 60_000;
const MAX_HISTORY_ENTRIES = 50;

interface HistoryRow {
  id: string;
  created_at: string;
  analysis_json: string;
}

interface HistoryChunkRow {
  source_id: string;
  text: string;
}

interface ContextRow {
  source_id: string;
  label: string;
  source_type: string;
  chunk_index: number;
  page_number: number | null;
  text: string;
}

export interface MessageContextSource {
  sourceId: string;
  label: string;
  sourceType: string;
  locator: string;
  text: string;
  status: 'unknown';
}

export interface MessageAnalysisContext {
  currentState: Awaited<ReturnType<D1CaseRepository['getSnapshot']>>['currentState'];
  sources: MessageContextSource[];
}

export class D1MessageHistoryRepository {
  constructor(private readonly db: D1Database, private readonly caseId = PRIMARY_CASE_ID) {}

  async saveAnalyzedMessage(message: string, analysis: MessageAnalysisResult, sourceId = crypto.randomUUID()): Promise<{ sourceId: string; eventId: string }> {
    const cleanMessage = message.trim();
    if (!cleanMessage) throw new Error('empty_message');
    if (analysis.mode !== 'model_analysis') throw new Error('model_analysis_required');

    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();
    const hash = await sha256Hex(cleanMessage);
    const label = `Besked analyseret ${new Date(now).toLocaleDateString('da-DK')}`;

    const statements = [
      this.db.prepare('INSERT OR IGNORE INTO cases (id, created_at, updated_at) VALUES (?, ?, ?)').bind(this.caseId, now, now),
      this.db.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').bind(now, this.caseId),
      this.db.prepare(`INSERT INTO case_sources (
        id, case_id, source_type, label, occurred_at, immutable_sha256,
        mime_type, document_kind, size_bytes, character_count, analysis_json, created_at
      ) VALUES (?, ?, 'message', ?, NULL, ?, 'text/plain', 'message', ?, ?, ?, ?)`)
        .bind(sourceId, this.caseId, label, hash, new TextEncoder().encode(cleanMessage).length, cleanMessage.length, JSON.stringify(analysis), now),
      this.db.prepare(`INSERT INTO case_source_chunks (
        case_id, source_id, chunk_index, page_number, text
      ) VALUES (?, ?, 0, NULL, ?)`)
        .bind(this.caseId, sourceId, cleanMessage),
      this.db.prepare(`INSERT INTO case_timeline_events (
        id, case_id, occurred_at, source_occurred_at, kind, topic, title, summary, disputed, created_at
      ) VALUES (?, ?, ?, NULL, 'message', 'message_analysis', 'Analyseret besked', ?, 0, ?)`)
        .bind(eventId, this.caseId, now, analysis.summary, now),
      this.db.prepare('INSERT INTO timeline_event_sources (case_id, event_id, source_id) VALUES (?, ?, ?)')
        .bind(this.caseId, eventId, sourceId),
    ];

    const results = await this.db.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('d1_message_save_failed');
    return { sourceId, eventId };
  }

  async listHistory(limit = 25): Promise<MessageHistoryEntry[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_HISTORY_ENTRIES));
    const [historyResult, chunkResult] = await Promise.all([
      this.db.prepare(`SELECT id, created_at, analysis_json
        FROM case_sources
        WHERE case_id = ? AND source_type = 'message'
        ORDER BY created_at DESC LIMIT ?`)
        .bind(this.caseId, safeLimit).all<HistoryRow>(),
      this.db.prepare(`SELECT c.source_id, c.text
        FROM case_source_chunks c
        JOIN case_sources s ON s.case_id = c.case_id AND s.id = c.source_id
        WHERE c.case_id = ? AND s.source_type = 'message' AND c.chunk_index = 0`)
        .bind(this.caseId).all<HistoryChunkRow>(),
    ]);

    const textBySource = new Map((chunkResult.results ?? []).map((row) => [row.source_id, row.text]));
    const entries: MessageHistoryEntry[] = [];
    for (const row of historyResult.results ?? []) {
      const message = textBySource.get(row.id);
      if (!message) continue;
      try {
        const analysis = MessageAnalysisResultSchema.parse(JSON.parse(row.analysis_json));
        entries.push(MessageHistoryEntrySchema.parse({ id: row.id, createdAt: row.created_at, message, analysis }));
      } catch {
        // Ignore malformed legacy rows rather than exposing unvalidated persisted model output.
      }
    }
    return entries;
  }

  async getAnalysisContext(): Promise<MessageAnalysisContext> {
    const [snapshot, chunkResult] = await Promise.all([
      new D1CaseRepository(this.db, this.caseId).getSnapshot(),
      this.db.prepare(`SELECT c.source_id, s.label, s.source_type, c.chunk_index, c.page_number, c.text
        FROM case_source_chunks c
        JOIN case_sources s ON s.case_id = c.case_id AND s.id = c.source_id
        WHERE c.case_id = ?
        ORDER BY s.created_at DESC, c.chunk_index ASC
        LIMIT 80`)
        .bind(this.caseId).all<ContextRow>(),
    ]);

    const sources: MessageContextSource[] = [];
    let used = 0;
    for (const row of chunkResult.results ?? []) {
      if (used >= MAX_CONTEXT_CHARACTERS) break;
      const remaining = MAX_CONTEXT_CHARACTERS - used;
      const text = row.text.slice(0, remaining);
      if (!text.trim()) continue;
      sources.push({
        sourceId: row.source_id,
        label: row.label,
        sourceType: row.source_type,
        locator: row.page_number === null ? `tekstblok ${row.chunk_index + 1}` : `side ${row.page_number}`,
        text,
        status: 'unknown',
      });
      used += text.length;
    }

    return { currentState: snapshot.currentState, sources };
  }
}
