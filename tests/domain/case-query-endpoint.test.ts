import { describe, expect, it } from 'vitest';
import { handleCaseQueryRequest } from '../../src/server/case-query-endpoint';
import type { CaseQueryProvider } from '../../src/server/anthropic-case-query-provider';
import type { WorkerEnv } from '../../src/server/document-analysis-endpoint';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/storage/d1-types';

class FakeStatement implements D1PreparedStatement {
  values: unknown[] = [];
  constructor(readonly query: string, private readonly matched: boolean) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return null as T | null; }
  async all<T>(): Promise<D1Result<T>> {
    if (this.matched && this.query.includes('FROM case_source_fts')) {
      return {
        success: true,
        results: [{
          source_id: 'synthetic-doc-1',
          label: 'Syntetisk vurderingsnotat',
          source_type: 'document',
          chunk_index: 0,
          page_number: 1,
          text: 'Det syntetiske dokument nævner en vurdering på et fiktivt beløb.',
        }] as T[],
      };
    }
    return { success: true, results: [] };
  }
  async run(): Promise<D1Result> { return { success: true }; }
}

class FakeDb implements D1Database {
  constructor(private readonly matched = false) {}
  prepare(query: string): FakeStatement { return new FakeStatement(query, this.matched); }
  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return statements.map(() => ({ success: true }));
  }
}

const usage = {
  taskType: 'message_analysis' as const,
  model: 'claude-sonnet-5' as const,
  effort: 'medium' as const,
  inputTokens: 100,
  outputTokens: 20,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  thinkingTokens: 0,
  latencyMs: 10,
  contextCharacters: 200,
};

function env(db: D1Database): WorkerEnv {
  return { DB: db, ANTHROPIC_API_KEY: 'synthetic-key', DOCUMENT_ANALYSIS_ENABLED: 'true' };
}

function request(question = 'Hvad står der om vurderingen?') {
  return new Request('https://private.example.invalid/api/case/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

function provider(answer: string): CaseQueryProvider {
  return {
    async query(_question, context) {
      return {
        payload: {
          answer,
          caseEvidenceFound: context.caseMatchFound,
          caseSourceIds: context.caseMatchFound ? [context.sources[0]!.sourceId] : [],
        },
        webSources: context.caseMatchFound ? [] : [{
          sourceId: 'web:1',
          label: 'Webkilde: Syntetisk offentlig side',
          sourceType: 'web_secondary',
          locator: 'https://example.invalid/synthetic-guide',
          text: 'Syntetisk webuddrag.',
          status: 'unknown',
        }],
        usage,
      };
    },
  };
}

describe('AI case query endpoint', () => {
  it('requires Access identity', async () => {
    const response = await handleCaseQueryRequest(request(), env(new FakeDb()), null, () => provider('Svar'));
    expect(response.status).toBe(401);
  });

  it('clearly marks a general web answer when no saved case material matches', async () => {
    const response = await handleCaseQueryRequest(
      request('Et helt andet syntetisk spørgsmål'),
      env(new FakeDb(false)),
      'user@example.invalid',
      () => provider('Her er et generelt syntetisk svar fra nettet.'),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { result: { answer: string; caseEvidenceFound: boolean; sources: Array<{ kind: string }> } };
    expect(body.result.caseEvidenceFound).toBe(false);
    expect(body.result.answer).toMatch(/^Jeg kan ikke finde noget i dine gemte beskeder eller dokumenter/u);
    expect(body.result.answer).toContain('generelt syntetisk svar');
    expect(body.result.sources).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'web' })]));
  });

  it('uses matching saved case material without adding the no-match warning', async () => {
    const response = await handleCaseQueryRequest(
      request(),
      env(new FakeDb(true)),
      'user@example.invalid',
      () => provider('Det gemte syntetiske dokument omtaler vurderingen.'),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { result: { answer: string; caseEvidenceFound: boolean; sources: Array<{ kind: string; label: string }> } };
    expect(body.result.caseEvidenceFound).toBe(true);
    expect(body.result.answer).toBe('Det gemte syntetiske dokument omtaler vurderingen.');
    expect(body.result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'case', label: 'Syntetisk vurderingsnotat' }),
    ]));
  });
});
