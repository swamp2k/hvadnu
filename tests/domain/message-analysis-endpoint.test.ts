import { describe, expect, it } from 'vitest';
import { handleMessageAnalysisRequest } from '../../src/server/message-analysis-endpoint';
import type { MessageAnalysisProvider } from '../../src/server/anthropic-message-provider';
import type { WebResearchProvider } from '../../src/server/anthropic-web-research-provider';
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
    PRIVATE_DEPLOYMENT_APPROVED: 'true',
    ANTHROPIC_ZDR_APPROVED: 'true',
    PAYLOAD_LOGGING_DISABLED: 'true',
  };
}

function request(message = 'Kan børnene hentes torsdag kl. 16?', webSearch = false) {
  return new Request('https://private.example.invalid/api/analyze-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, webSearch }),
  });
}

function payloadFor(id: string, highUncertainty = true) {
  return {
    summary: 'Beskeden spørger om et ændret tidspunkt.',
    replyNeeded: ['Svar på tidspunktet.'],
    canIgnore: [],
    caseContext: [{ text: 'Den aktuelle besked spørger om torsdag.', sourceIds: [id] }],
    legalAssessment: {
      level: 'uncertain' as const,
      title: 'Kræver sagsgrundlag',
      explanation: 'Der er ikke leveret en aktuel juridisk kilde, som afgør spørgsmålet.',
      sourceIds: [id],
    },
    communicationAssessment: { title: 'Svar kort', explanation: 'Hold svaret neutralt.' },
    suggestedReply: 'Jeg vender tilbage om tidspunktet.',
    uncertainty: highUncertainty
      ? { level: 'high' as const, missing: ['Aktuel aftale eller afgørelse.'] }
      : { level: 'medium' as const, missing: ['Aktuel aftale eller afgørelse.'] },
    citations: [{ sourceId: id, label: 'Aktuel besked', status: 'unknown' as const, locator: 'hele beskeden' }],
  };
}

function usage(taskType: 'message_analysis' | 'message_review' | 'web_research', effort: 'medium' | 'high') {
  return {
    taskType,
    model: 'claude-sonnet-5' as const,
    effort,
    inputTokens: 100,
    outputTokens: 20,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    thinkingTokens: 5,
    latencyMs: 10,
    contextCharacters: 200,
  };
}

function providerFor(sourceId: (context: Parameters<MessageAnalysisProvider['analyze']>[0]['context']) => string, highUncertainty = true): MessageAnalysisProvider {
  return {
    async analyze({ context }) {
      return { payload: payloadFor(sourceId(context), highUncertainty), usage: usage('message_analysis', 'medium') };
    },
    async review({ context }) {
      return { payload: payloadFor(sourceId(context), false), usage: usage('message_review', 'high') };
    },
  };
}

function webSource(): MessageContextSource {
  return {
    sourceId: 'web:1',
    label: 'Officiel webkilde: Syntetisk domstolsafgørelse',
    sourceType: 'web_official',
    locator: 'https://www.domstol.dk/synthetic/decision',
    text: 'Syntetisk citeret tekst fra en offentlig afgørelse.',
    status: 'unknown',
  };
}

function webProvider(source = webSource()): WebResearchProvider {
  return {
    async research() {
      return { sources: [source], usage: usage('web_research', 'medium') };
    },
  };
}

describe('M4 legal-aware live message analysis', () => {
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

  it('does not pay for a second Sonnet pass merely because evidence is uncertain or samvær is mentioned', async () => {
    const db = new FakeDb();
    let reviewCalled = false;
    const base = providerFor((context) => context.sources[0]!.sourceId, true);
    const response = await handleMessageAnalysisRequest(
      request('Kan vi bytte samværsweekend denne ene gang?'),
      env(db),
      'user@example.invalid',
      () => ({
        ...base,
        async review(input) {
          reviewCalled = true;
          return base.review(input);
        },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      historySaved: boolean;
      sourceId: string;
      analysis: { reviewPlan: { passes: number }; citations: Array<{ sourceId: string }> };
    };
    expect(body.historySaved).toBe(true);
    expect(body.analysis.reviewPlan.passes).toBe(1);
    expect(reviewCalled).toBe(false);
    expect(body.analysis.citations[0]?.sourceId).toBe(body.sourceId);
    expect(db.batches.some((batch) => batch.some((statement) => statement.query.includes('ai_usage_events')))).toBe(true);
    expect(db.batches.some((batch) => batch.some((statement) => statement.query.includes("'message'")))).toBe(true);
  });

  it('uses a high-effort second pass for materially risky uncertain samvær changes', async () => {
    const db = new FakeDb();
    let reviewCalled = false;
    const base = providerFor((context) => context.sources[0]!.sourceId, true);
    const response = await handleMessageAnalysisRequest(
      request('Jeg stopper samvær fra næste weekend. Hvad skal jeg svare?'),
      env(db),
      'user@example.invalid',
      () => ({
        ...base,
        async review(input) {
          reviewCalled = true;
          return base.review(input);
        },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { analysis: { reviewPlan: { passes: number; humanReviewRecommended: boolean } } };
    expect(body.analysis.reviewPlan.passes).toBe(2);
    expect(body.analysis.reviewPlan.humanReviewRecommended).toBe(true);
    expect(reviewCalled).toBe(true);
    const telemetryWrites = db.batches.filter((batch) => batch.some((statement) => statement.query.includes('ai_usage_events')));
    expect(telemetryWrites).toHaveLength(2);
  });

  it('adds opt-in web research as evidence, normalizes its citation metadata, and snapshots only cited web material', async () => {
    const db = new FakeDb();
    const source = webSource();
    const mainProvider: MessageAnalysisProvider = {
      async analyze({ context }) {
        expect(context.sources.some((item) => item.sourceId === source.sourceId)).toBe(true);
        return {
          payload: {
            summary: 'En offentlig afgørelse kan være relevant.',
            replyNeeded: ['Svar kort.'],
            canIgnore: [],
            caseContext: [{ text: 'Webkilden er relevant research.', sourceIds: [source.sourceId] }],
            legalAssessment: {
              level: 'supported',
              title: 'Research fundet',
              explanation: 'Det konkrete webuddrag understøtter vurderingen.',
              sourceIds: [source.sourceId],
            },
            communicationAssessment: { title: 'Neutral', explanation: 'Svar neutralt.' },
            suggestedReply: 'Tak. Jeg forholder mig til det skriftligt.',
            uncertainty: { level: 'low', missing: [] },
            citations: [{
              sourceId: source.sourceId,
              label: 'MODEL MAY NOT CHOOSE LABEL',
              status: 'current',
              locator: 'https://invented.example.invalid/',
            }],
          },
          usage: usage('message_analysis', 'medium'),
        };
      },
      async review() {
        throw new Error('review_not_expected');
      },
    };

    const response = await handleMessageAnalysisRequest(
      request('Findes der afgørelser om dette samværsspørgsmål?', true),
      env(db),
      'user@example.invalid',
      () => mainProvider,
      () => webProvider(source),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      historySaved: boolean;
      webSearch: { requested: boolean; used: boolean; sourceCount: number; failed: boolean };
      analysis: { citations: Array<{ sourceId: string; label: string; locator?: string; status: string }> };
    };
    expect(body.historySaved).toBe(true);
    expect(body.webSearch).toEqual({ requested: true, used: true, sourceCount: 1, failed: false });
    expect(body.analysis.citations[0]).toMatchObject({
      sourceId: 'web:1',
      label: source.label,
      locator: source.locator,
      status: 'unknown',
    });
    const webInsert = db.batches.flat().find((statement) => statement.query.includes('INSERT INTO message_web_sources'));
    expect(webInsert?.values).toContain(source.locator);
    expect(webInsert?.values).toContain(source.text);
    const telemetryWrites = db.batches.filter((batch) => batch.some((statement) => statement.query.includes('ai_usage_events')));
    expect(telemetryWrites).toHaveLength(2);
  });

  it('fails soft when optional web research is unavailable and still analyzes from case/library context', async () => {
    const db = new FakeDb();
    const base = providerFor((context) => context.sources[0]!.sourceId, false);
    const response = await handleMessageAnalysisRequest(
      request('Hvad gælder om samvær?', true),
      env(db),
      'user@example.invalid',
      () => base,
      () => ({ async research() { throw new Error('synthetic_web_failure'); } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      historySaved: boolean;
      webSearch: { requested: boolean; used: boolean; sourceCount: number; failed: boolean };
    };
    expect(body.historySaved).toBe(true);
    expect(body.webSearch).toEqual({ requested: true, used: false, sourceCount: 0, failed: true });
    expect(db.batches.flat().some((statement) => statement.query.includes('message_web_sources'))).toBe(false);
  });

  it('rejects fabricated source IDs and does not persist message history', async () => {
    const db = new FakeDb();
    const response = await handleMessageAnalysisRequest(request(), env(db), 'user@example.invalid', () =>
      providerFor(() => 'invented-source'));
    expect(response.status).toBe(502);
    expect(db.batches.some((batch) => batch.some((statement) => statement.query.includes("'message'")))).toBe(false);
  });
});
