import { describe, expect, it } from 'vitest';
import { handleAiUsageRequest } from '../../src/server/ai-usage-endpoint';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/storage/d1-types';

class FakeStatement implements D1PreparedStatement {
  values: unknown[] = [];
  constructor(readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return null as T | null; }
  async all<T>(): Promise<D1Result<T>> {
    if (this.query.includes('FROM ai_usage_events')) {
      return {
        success: true,
        results: [{
          task_type: 'message_analysis',
          effort: 'medium',
          calls: 2,
          input_tokens: 200,
          output_tokens: 40,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 80,
          thinking_tokens: 10,
          average_latency_ms: 100,
          average_context_characters: 500,
        }] as T[],
      };
    }
    return { success: true, results: [] };
  }
  async run(): Promise<D1Result> { return { success: true }; }
}

class FakeDb implements D1Database {
  readonly statements: FakeStatement[] = [];
  prepare(query: string): FakeStatement {
    const statement = new FakeStatement(query);
    this.statements.push(statement);
    return statement;
  }
  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return statements.map(() => ({ success: true }));
  }
}

describe('AI usage telemetry endpoint', () => {
  it('fails closed before database access without Access identity', async () => {
    const db = new FakeDb();
    const response = await handleAiUsageRequest(new Request('https://private.example.invalid/api/ai-usage'), db, null);
    expect(response.status).toBe(401);
    expect(db.statements).toHaveLength(0);
  });

  it('returns metadata-only aggregate usage to an authorized identity', async () => {
    const db = new FakeDb();
    const response = await handleAiUsageRequest(new Request('https://private.example.invalid/api/ai-usage?days=7'), db, 'user@example.invalid');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      days: 7,
      usage: [{
        taskType: 'message_analysis',
        effort: 'medium',
        calls: 2,
        inputTokens: 200,
        outputTokens: 40,
        cacheCreationInputTokens: 20,
        cacheReadInputTokens: 80,
        thinkingTokens: 10,
        averageLatencyMs: 100,
        averageContextCharacters: 500,
      }],
    });
  });
});
