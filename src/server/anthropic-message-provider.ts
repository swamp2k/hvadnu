import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MESSAGE_ANALYSIS_SYSTEM_PROMPT } from '../ai/prompts/message-analysis';
import { toAiUsageMetadata, type AiUsageMetadata } from '../ai/usage';
import type { MessageTone } from '../domain/message-tone';
import { MessageAnalysisPayloadSchema, type MessageAnalysisPayload } from '../domain/message-result';
import type { MessageAnalysisContext, MessageContextSource } from '../storage/d1-message-history-repository';
import { extractWebSources } from './web-source-extraction';

interface MessageAnalysisInput {
  context: MessageAnalysisContext;
  tone: MessageTone;
}

export interface MessageProviderResult {
  payload: MessageAnalysisPayload;
  webSources: MessageContextSource[];
  usage: AiUsageMetadata;
}

export interface MessageAnalysisProvider {
  analyze(input: MessageAnalysisInput): Promise<MessageProviderResult>;
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
  if (response.stop_reason === 'pause_turn') throw new AnthropicMessageAnalysisError('Claude did not finish the request in one turn.');
  if (!response.parsed_output) throw new AnthropicMessageAnalysisError('Claude returned no validated structured result.');
  return MessageAnalysisPayloadSchema.parse(response.parsed_output);
}

function promptBlocks(context: MessageAnalysisContext, tone: MessageTone) {
  const stablePrefix = JSON.stringify({
    sourceType: 'case_state',
    currentState: context.currentState,
  });
  const dynamicBundle = JSON.stringify({
    sourceType: 'case_message_bundle',
    requestedReplyTone: tone,
    relevantSavedSources: context.sources,
    instructions: [
      'Analyze the source labeled Aktuel besked.',
      'Use saved sources only when relevant to this message.',
      'You may use web search when current law, previous published cases, public guidance or another up-to-date external fact materially helps.',
      'Do not search merely because the topic is legal; search when it improves confidence or usefulness.',
      'The suggested reply must follow requestedReplyTone.',
    ],
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
    async analyze({ context, tone }) {
      const prompt = promptBlocks(context, tone);
      const startedAt = Date.now();
      const response = await client.messages.parse({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: MESSAGE_ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.content }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        output_config: {
          effort: 'medium',
          format: zodOutputFormat(MessageAnalysisPayloadSchema),
        },
      });
      return {
        payload: parsedOutputOrThrow(response),
        webSources: extractWebSources(response.content),
        usage: toAiUsageMetadata({
          taskType: 'message_analysis',
          effort: 'medium',
          usage: response.usage,
          latencyMs: Date.now() - startedAt,
          contextCharacters: prompt.contextCharacters,
        }),
      };
    },
  };
}
