import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MESSAGE_ANALYSIS_SYSTEM_PROMPT, MESSAGE_REVIEW_SYSTEM_PROMPT } from '../ai/prompts/message-analysis';
import { toAiUsageMetadata, type AiUsageMetadata } from '../ai/usage';
import { MessageAnalysisPayloadSchema, type MessageAnalysisPayload } from '../domain/message-result';
import type { MessageAnalysisContext } from '../storage/d1-message-history-repository';

interface MessageAnalysisInput {
  context: MessageAnalysisContext;
}

export interface MessageProviderResult {
  payload: MessageAnalysisPayload;
  usage: AiUsageMetadata;
}

export interface MessageAnalysisProvider {
  analyze(input: MessageAnalysisInput): Promise<MessageProviderResult>;
  review(input: MessageAnalysisInput & { firstAnalysis: MessageAnalysisPayload }): Promise<MessageProviderResult>;
}

export class AnthropicMessageAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicMessageAnalysisError';
  }
}

function parsedOutputOrThrow(response: Awaited<ReturnType<Anthropic['messages']['parse']>>): MessageAnalysisPayload {
  if (response.stop_reason === 'refusal') throw new AnthropicMessageAnalysisError('Claude refused the message analysis request.');
  if (response.stop_reason === 'max_tokens') throw new AnthropicMessageAnalysisError('Claude reached the output limit.');
  if (!response.parsed_output) throw new AnthropicMessageAnalysisError('Claude returned no validated structured result.');
  return MessageAnalysisPayloadSchema.parse(response.parsed_output);
}

function promptBlocks(context: MessageAnalysisContext, extra: Record<string, unknown>) {
  const stablePrefix = JSON.stringify({
    sourceType: 'stable_case_state',
    currentState: context.currentState,
  });
  const dynamicBundle = JSON.stringify({
    sourceType: 'untrusted_case_message_bundle',
    relevantSources: context.sources,
    ...extra,
  });
  return {
    contextCharacters: stablePrefix.length + dynamicBundle.length,
    content: [
      { type: 'text' as const, text: stablePrefix, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: dynamicBundle },
    ],
  };
}

export function createAnthropicMessageAnalysisProvider(apiKey: string): MessageAnalysisProvider {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new AnthropicMessageAnalysisError('Anthropic API key is missing.');
  const client = new Anthropic({ apiKey: trimmedKey });

  return {
    async analyze({ context }) {
      const prompt = promptBlocks(context, {
        instructions: 'Analyze the source labeled Aktuel besked. Return only conclusions supported by supplied sources. If no current legal source is supplied, do not state current Danish law as fact.',
      });
      const startedAt = Date.now();
      const response = await client.messages.parse({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: MESSAGE_ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.content }],
        output_config: {
          effort: 'medium',
          format: zodOutputFormat(MessageAnalysisPayloadSchema),
        },
      });
      return {
        payload: parsedOutputOrThrow(response),
        usage: toAiUsageMetadata({
          taskType: 'message_analysis',
          effort: 'medium',
          usage: response.usage,
          latencyMs: Date.now() - startedAt,
          contextCharacters: prompt.contextCharacters,
        }),
      };
    },

    async review({ context, firstAnalysis }) {
      const prompt = promptBlocks(context, {
        firstAnalysis,
        instructions: 'Return the complete corrected structured analysis. Preserve supported parts, but remove or correct anything unsupported, stale, overconfident, escalatory, or based on model memory.',
      });
      const startedAt = Date.now();
      const response = await client.messages.parse({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: MESSAGE_REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.content }],
        output_config: {
          effort: 'high',
          format: zodOutputFormat(MessageAnalysisPayloadSchema),
        },
      });
      return {
        payload: parsedOutputOrThrow(response),
        usage: toAiUsageMetadata({
          taskType: 'message_review',
          effort: 'high',
          usage: response.usage,
          latencyMs: Date.now() - startedAt,
          contextCharacters: prompt.contextCharacters,
        }),
      };
    },
  };
}
