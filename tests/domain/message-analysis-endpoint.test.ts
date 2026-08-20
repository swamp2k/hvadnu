import { describe, expect, it } from 'vitest';
import { handleMessageAnalysisRequest } from '../../src/server/message-analysis-endpoint';
import type { MessageAnalysisProvider } from '../../src/server/anthropic-message-provider';
import type { WorkerEnv } from '../../src/server/document-analysis-endpoint';
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

function env(db: D1Database): WorkerEnv {
  return {
    DB: db,
    ANTHROPIC_API_KEY: 'synthetic-key',
    DOCUMENT_ANALYSIS_ENABLED: 'true',
    PRIVATE_DEPLOYMENT_APPROVED: 'true',
    ANTHROPIC_ZDR_APPROVED: 'true',
    PAYLOAD_LOGGING_DISABLED: 'true',
  };
}

function request(message = 'Kan børnene hentes torsdag kl. 16?') {
  return new Request('https://private.example.invalid/api/analyze-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

function providerFor(sourceId: (context: Parameters<MessageAnalysisProvider['analyze']>[0]['context']) => string): MessageAnalysisProvider {
  return {
    async analyze({ context }) {
      const id = sourceId(context);
      return {
        summary: 'Beskeden spørger om et ændret tidspunkt.',
        replyNeeded: ['Svar på tidspunktet.'],
        canIgnore: [],
        caseContext: [{ text: 'Den aktuelle besked spørger om torsdag.', sourceIds: [id] }],
        legalAssessment: {
          level: 'uncertain',
          title: 'Kræver sagsgrundlag',
          explanation: 'Der er ikke leveret en aktuel juridisk kilde, som afgør spørgsmålet.',
          sourceIds: [id],
        },
        communicationAssessment: { title: 'Svar kort', explanation: 'Hold svaret neutralt.' },
        suggestedReply: 'Jeg vender tilbage om tidspunktet.',
        uncertainty: { level: 'high', missing: ['Aktuel aftale eller afgørelse.'] },
        citations: [{ sourceId: id, label: 'Aktuel besked', status: 'unknown', locator: 'hele beskeden' }],
      };
    },
  };
}

describe('M3c live message analysis', () => {
  it('fails closed before D1/provider work without Access identity', async () => {
    const db = new FakeDb();
    let constructed = false;
    const response = await handleMessageAnalysisRequest(request(), env(db), null, () => {
      constructed = true;
      return providerFor((context) => context.sources[0]!.sourceId);
    });
    expect(response.status).toBe(401);
    expect(constructed).toBe(false);
    expect(db.statements).toHaveLength(0);
  });

  it('uses the incoming message real source ID and persists successful analysis history', async () => {
    const db = new FakeDb();
    const response = await handleMessageAnalysisRequest(request(), env(db), 'user@example.invalid', () =>
      providerFor((context) => context.sources[0]!.sourceId));
    expect(response.status).toBe(200);
    const body = await response.json() as { historySaved: boolean; sourceId: string; analysis: { mode: string; citations: Array<{ sourceId: string }> } };
    expect(body.historySaved).toBe(true);
    expect(body.analysis.mode).toBe('model_analysis');
    expect(body.analysis.citations[0]?.sourceId).toBe(body.sourceId);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]?.some((statement) => statement.query.includes("'message'"))).toBe(true);
  });

  it('rejects fabricated source IDs and does not persist them', async () => {
    const db = new FakeDb();
    const response = await handleMessageAnalysisRequest(request(), env(db), 'user@example.invalid', () =>
      providerFor(() => 'invented-source'));
    expect(response.status).toBe(502);
    expect(db.batches).toHaveLength(0);
  });
});
