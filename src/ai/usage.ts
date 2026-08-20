export type AiTaskType = 'message_analysis' | 'message_review' | 'document_analysis';
export type AiEffort = 'medium' | 'high';

export interface AiUsageMetadata {
  taskType: AiTaskType;
  model: 'claude-sonnet-5';
  effort: AiEffort;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  thinkingTokens: number;
  latencyMs: number;
  contextCharacters: number;
}

interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number | null } | null;
}

export function toAiUsageMetadata(args: {
  taskType: AiTaskType;
  effort: AiEffort;
  usage: AnthropicUsageLike;
  latencyMs: number;
  contextCharacters: number;
}): AiUsageMetadata {
  return {
    taskType: args.taskType,
    model: 'claude-sonnet-5',
    effort: args.effort,
    inputTokens: args.usage.input_tokens ?? 0,
    outputTokens: args.usage.output_tokens ?? 0,
    cacheCreationInputTokens: args.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: args.usage.cache_read_input_tokens ?? 0,
    thinkingTokens: args.usage.output_tokens_details?.thinking_tokens ?? 0,
    latencyMs: Math.max(0, Math.round(args.latencyMs)),
    contextCharacters: Math.max(0, Math.round(args.contextCharacters)),
  };
}
