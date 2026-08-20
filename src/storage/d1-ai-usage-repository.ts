import type { AiUsageMetadata } from '../ai/usage';
import { PRIMARY_CASE_ID } from './d1-case-repository';
import type { D1Database } from './d1-types';

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
}
