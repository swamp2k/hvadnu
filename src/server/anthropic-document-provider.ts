import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { DocumentExplanationPayloadSchema } from '../domain/document';
import type { DocumentAnalysisProvider } from './document-analysis-service';

export class AnthropicDocumentAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicDocumentAnalysisError';
  }
}

export function createAnthropicDocumentAnalysisProvider(apiKey: string): DocumentAnalysisProvider {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new AnthropicDocumentAnalysisError('Anthropic API key is missing.');

  const client = new Anthropic({ apiKey: trimmedKey });

  return {
    async analyze({ model, prompt }) {
      const message = await client.messages.parse({
        model,
        max_tokens: 4096,
        system: prompt.system,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              sourceType: 'untrusted_case_document',
              source: prompt.source,
            }),
          },
        ],
        output_config: {
          format: zodOutputFormat(DocumentExplanationPayloadSchema),
        },
      });

      if (message.stop_reason === 'refusal') {
        throw new AnthropicDocumentAnalysisError('Claude refused the document analysis request.');
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AnthropicDocumentAnalysisError('Claude reached the output limit before completing the structured result.');
      }
      if (!message.parsed_output) {
        throw new AnthropicDocumentAnalysisError('Claude returned no validated structured result.');
      }

      return message.parsed_output;
    },
  };
}
