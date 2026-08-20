import { describe, expect, it } from 'vitest';
import { handleMessageAnalysisRequest } from '../../src/server/message-analysis-endpoint';
import type { MessageAnalysisProvider } from '../../src/server/anthropic-message-provider';
import type { WorkerEnv } from '../../src/server/document-analysis-endpoint';
import type { MessageContextSource } from '../../src/storage/d1-message-history-repository';
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
  };
}

function request(message = 'Kan vi flytte afhentning til torsdag?', tone = 'neutral') {
  return new Request('https://private.example.invalid/api/analyze-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, tone }),
  });
}

function payloadFor(id: string) {
  return {
    summary: 'Beskeden spørger om et andet tidspunkt.',
    replyNeeded: ['Svar på tidspunktet.'],
    canIgnore: [],
    caseContext: [{ text: 'Den aktuelle besked spørger om torsdag.', sourceIds: [id] }],
    legalAssessment: {
      level: 'uncertain' as const,
      title: 'Praktisk vurdering',
      explanation: 'Det afhænger af den konkrete aftale.',
      sourceIds: [id],
    },
    communicationAssessment: { title: 'Kort spørgsmål', explanation: 'Der bliver bedt om en konkret ændring.' },
    suggestedReply: 'Torsdag passer fint.',
    uncertainty: { level: 'medium' as const, missing: ['Den fulde aftale er ikke kendt.'] },
    citations: [{ sourceId: id, label: 'Aktuel besked', status: 'unknown' as const, locator: 'hele beskeden' }],
  };
}

const usage = {
  taskType: 'message_analysis' as const,
  model: 'claude-sonnet-5' as const,
  effort: 'medium' as const,
  inputTokens: 100,
  outputTokens: 20,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  thinkingTokens: 5,
  latencyMs: 10,
  contextCharacters: 200,
};

function providerFor(sourceId: (context: Parameters<MessageAnalysisProvider['analyze']>[0]['context']) => string, webSources: MessageContextSource[] = []): MessageAnalysisProvider {
  return {
    async analyze({ context }) {
      return { payload: payloadFor(sourceId(context)), webSources, usage };
    },
  };
}

function webSource(): MessageContextSource {
  return {
    sourceId: 'web:1',
    label: 'Officiel webkilde: Syntetisk vejledning',
    sourceType: 'web_official',
    locator: 'https://www.domstol.dk/synthetic/guide',
    text: 'Syntetisk citeret tekst.',
    status: 'unknown',
  };
}

describe('simplified live message analysis', () => {
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

  it('uses exactly one provider pass, forwards tone, saves history and never queries the local legal library', async () => {
    const db = new FakeDb();
    let calls = 0;
    let receivedTone = '';
    const response = await handleMessageAnalysisRequest(
      request('Kan vi flytte afhentning til torsdag?', 'firm'),
      env(db),
      'user@example.invalid',
      () => ({
        async analyze({ context, tone }) {
          calls += 1;
          receivedTone = tone;
          return { payload: payloadFor(context.sources[0]!.sourceId), webSources: [], usage };
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { historySaved: boolean; analysis: { reviewPlan: { passes: number } } };
    expect(body.historySaved).toBe(true);
    expect(body.analysis.reviewPlan.passes).toBe(1);
    expect(calls).toBe(1);
    expect(receivedTone).toBe('firm');
    expect(db.statements.some((statement) => statement.query.includes('legal_reference'))).toBe(false);
    expect(db.batches.filter((batch) => batch.some((statement) => statement.query.includes('ai_usage_events')))).toHaveLength(1);
  });

  it('adds web citations returned by the same Sonnet pass and snapshots them with history', async () => {
    const db = new FakeDb();
    const source = webSource();
    const response = await handleMessageAnalysisRequest(
      request('Er der nyere offentlig information om det her?'),
      env(db),
      'user@example.invalid',
      () => providerFor((context) => context.sources[0]!.sourceId, [source]),
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { analysis: { citations: Array<{ sourceId: string; locator?: string }> } };
    expect(body.analysis.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'web:1', locator: source.locator }),
    ]));
    const webInsert = db.batches.flat().find((statement) => statement.query.includes('INSERT INTO message_web_sources'));
    expect(webInsert?.values).toContain(source.locator);
    expect(webInsert?.values).toContain(source.text);
  });

  it('rejects fabricated saved-case source IDs and does not persist message history', async () => {
    const db = new FakeDb();
    const response = await handleMessageAnalysisRequest(
      request(),
      env(db),
      'user@example.invalid',
      () => providerFor(() => 'invented-source'),
    );
    expect(response.status).toBe(502);
    expect(db.batches.some((batch) => batch.some((statement) => statement.query.includes("'message'")))).toBe(false);
  });
});
