import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MessageAnalysisPayloadSchema, type MessageAnalysisPayload } from '../domain/message-result';
import { MESSAGE_ANALYSIS_SYSTEM_PROMPT, MESSAGE_REVIEW_SYSTEM_PROMPT } from '../ai/prompts/message-analysis';
import type { MessageAnalysisContext } from '../storage/d1-message-history-repository';

interface MessageAnalysisInput {
  message: string;
  context: MessageAnalysisContext;
}

export interface MessageAnalysisProvider {
  analyze(input: MessageAnalysisInput): Promise<MessageAnalysisPayload>;
  review(input: MessageAnalysisInput & { firstAnalysis: MessageAnalysisPayload }): Promise<MessageAnalysisPayload>;
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

export function createAnthropicMessageAnalysisProvider(apiKey: string): MessageAnalysisProvider {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new AnthropicMessageAnalysisError('Anthropic API key is missing.');
  const client = new Anthropic({ apiKey: trimmedKey });

  return {
    async analyze({ message, context }) {
      const response = await client.messages.parse({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: MESSAGE_ANALYSIS_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            sourceType: 'untrusted_case_message',
            message,
            caseContext: context,
            instructions: 'Return only conclusions supported by supplied sources. If no current legal source is supplied, do not state current Danish law as fact.',
          }),
        }],
        output_config: { format: zodOutputFormat(MessageAnalysisPayloadSchema) },
      });
      return parsedOutputOrThrow(response);
    },

    async review({ message, context, firstAnalysis }) {
      const response = await client.messages.parse({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: MESSAGE_REVIEW_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            sourceType: 'critical_review_bundle',
            message,
            caseContext: context,
            firstAnalysis,
            instructions: 'Return the complete corrected structured analysis in the required schema. Preserve supported parts, but remove or correct anything unsupported, stale, overconfident, escalatory, or based on model memory.',
          }),
        }],
        output_config: { format: zodOutputFormat(MessageAnalysisPayloadSchema) },
      });
      return parsedOutputOrThrow(response);
    },
  };
}
