import { describe, expect, it } from 'vitest';
import type { DocumentExplanation, ExtractedDocument } from '../../src/domain/document';
import {
  handleCaseDeleteRequest,
  handleCaseExportRequest,
  handleCaseImportDocumentRequest,
  handleCaseSnapshotRequest,
} from '../../src/server/case-endpoint';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/storage/d1-types';

class FakeStatement implements D1PreparedStatement {
  values: unknown[] = [];
  constructor(readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return null as T | null; }
  async all<T>(): Promise<D1Result<T>> { return { success: true, results: [] }; }
  async run(): Promise<D1Result> { return { success: true }; }
}

class FakeDb implements D1Database {
  readonly statements: FakeStatement[] = [];
  readonly batches: FakeStatement[][] = [];
  prepare(query: string): FakeStatement {
    const statement = new FakeStatement(query);
    this.statements.push(statement);
    return statement;
  }
  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.batches.push(statements as FakeStatement[]);
    return statements.map(() => ({ success: true }));
  }
}

const document: ExtractedDocument = {
  name: 'synthetic-letter.txt',
  mimeType: 'text/plain',
  kind: 'text',
  sizeBytes: 120,
  pageCount: 1,
  characterCount: 26,
  pages: [{ pageNumber: 1, text: 'Synthetic source text only.' }],
  warnings: [],
};

const explanation: DocumentExplanation = {
  mode: 'model_analysis',
  title: 'Syntetisk dokument',
  documentType: 'lawyer_letter',
  sourceStatus: 'proposal',
  summary: 'Et syntetisk forslag uden juridisk virkning i testen.',
  whatItMeans: ['Det er et forslag.'],
  actions: ['Ingen handling i fixture.'],
  deadlines: [],
  importantPassages: [{ text: 'Synthetic source text only.', locator: 'tekstblok' }],
  uncertainty: ['Kun syntetiske data.'],
};

function post(body: unknown) {
  return new Request('https://private.example.invalid/api/case/import-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('M3b case persistence boundary', () => {
  it('rejects persistence before reading or touching D1 when Access identity is absent', async () => {
    const db = new FakeDb();
    const response = await handleCaseImportDocumentRequest(post({ nonsense: true }), db, null);
    expect(response.status).toBe(401);
    expect(db.statements).toHaveLength(0);
  });

  it('persists only explicit model analysis imports and uses a D1 batch', async () => {
    const db = new FakeDb();
    const response = await handleCaseImportDocumentRequest(post({ document, explanation }), db, 'allowed@example.invalid');
    expect(response.status).toBe(201);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(5);
    const sourceInsert = db.batches[0]!.find((statement) => statement.query.includes('INSERT INTO case_sources'));
    expect(sourceInsert?.values).toContain('Synthetic source text only.');
  });

  it('refuses synthetic demo explanations so fixtures cannot be saved as production evidence', async () => {
    const db = new FakeDb();
    const response = await handleCaseImportDocumentRequest(post({
      document,
      explanation: { ...explanation, mode: 'synthetic_demo' },
    }), db, 'allowed@example.invalid');
    expect(response.status).toBe(400);
    expect(db.batches).toHaveLength(0);
  });

  it('returns an empty live snapshot when the case has not been created yet', async () => {
    const db = new FakeDb();
    const response = await handleCaseSnapshotRequest(
      new Request('https://private.example.invalid/api/case'),
      db,
      'allowed@example.invalid',
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { snapshot: { caseId: string; timeline: unknown[]; currentState: unknown[] } };
    expect(body.snapshot.caseId).toBe('primary-case');
    expect(body.snapshot.timeline).toEqual([]);
    expect(body.snapshot.currentState).toEqual([]);
  });

  it('supports full export and explicit case deletion behind Access', async () => {
    const db = new FakeDb();
    const exportResponse = await handleCaseExportRequest(
      new Request('https://private.example.invalid/api/case/export'),
      db,
      'allowed@example.invalid',
    );
    expect(exportResponse.status).toBe(200);

    const deleteResponse = await handleCaseDeleteRequest(
      new Request('https://private.example.invalid/api/case/delete', { method: 'DELETE' }),
      db,
      'allowed@example.invalid',
    );
    expect(deleteResponse.status).toBe(200);
    expect(db.statements.some((statement) => statement.query.startsWith('DELETE FROM cases'))).toBe(true);
  });
});
