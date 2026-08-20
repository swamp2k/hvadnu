import type { AiTaskType, AiUsageMetadata } from '../ai/usage';
import { PRIMARY_CASE_ID } from './d1-case-repository';
import type { D1Database } from './d1-types';

interface UsageSummaryRow {
  task_type: AiTaskType;
  effort: 'medium' | 'high';
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  thinking_tokens: number;
  average_latency_ms: number;
  average_context_characters: number;
}

export interface AiUsageSummary {
  taskType: AiTaskType;
  effort: 'medium' | 'high';
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  thinkingTokens: number;
  averageLatencyMs: number;
  averageContextCharacters: number;
}

export class D1AiUsageRepository {
  constructor(private readonly db: D1Database, private readonly caseId = PRIMARY_CASE_ID) {}

  async record(usage: AiUsageMetadata): Promise<void> {
    const now = new Date().toISOString();
    const statements = [
      this.db.prepare('INSERT OR IGNORE INTO cases (id, created_at, updated_at) VALUES (?, ?, ?)').bind(this.caseId, now, now),
      this.db.prepare(`INSERT INTO ai_usage_events (
        id, case_id, task_type, model, effort, input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens, thinking_tokens,
        latency_ms, context_characters, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          this.caseId,
          usage.taskType,
          usage.model,
          usage.effort,
          usage.inputTokens,
          usage.outputTokens,
          usage.cacheCreationInputTokens,
          usage.cacheReadInputTokens,
          usage.thinkingTokens,
          usage.latencyMs,
          usage.contextCharacters,
          now,
        ),
    ];
    const results = await this.db.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('d1_ai_usage_write_failed');
  }

  async summarize(days = 30): Promise<AiUsageSummary[]> {
    const safeDays = Math.max(1, Math.min(days, 365));
    const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
    const result = await this.db.prepare(`SELECT
        task_type,
        effort,
        COUNT(*) AS calls,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_creation_input_tokens) AS cache_creation_input_tokens,
        SUM(cache_read_input_tokens) AS cache_read_input_tokens,
        SUM(thinking_tokens) AS thinking_tokens,
        ROUND(AVG(latency_ms)) AS average_latency_ms,
        ROUND(AVG(context_characters)) AS average_context_characters
      FROM ai_usage_events
      WHERE case_id = ? AND created_at >= ?
      GROUP BY task_type, effort
      ORDER BY task_type, effort`)
      .bind(this.caseId, since).all<UsageSummaryRow>();

    return (result.results ?? []).map((row) => ({
      taskType: row.task_type,
      effort: row.effort,
      calls: row.calls,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheCreationInputTokens: row.cache_creation_input_tokens,
      cacheReadInputTokens: row.cache_read_input_tokens,
      thinkingTokens: row.thinking_tokens,
      averageLatencyMs: row.average_latency_ms,
      averageContextCharacters: row.average_context_characters,
    }));
  }
}
