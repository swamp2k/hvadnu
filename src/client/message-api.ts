import { MessageAnalysisResultSchema, MessageHistoryEntrySchema, type MessageAnalysisResult, type MessageHistoryEntry } from '../domain/message-result';

export class MessageApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'MessageApiError';
  }
}

export interface MessageWebSearchStatus {
  requested: boolean;
  used: boolean;
  sourceCount: number;
  failed: boolean;
}

export async function analyzeMessage(
  message: string,
  options: { webSearch?: boolean } = {},
): Promise<{ analysis: MessageAnalysisResult; historySaved: boolean; webSearch: MessageWebSearchStatus }> {
  const response = await fetch('/api/analyze-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, webSearch: options.webSearch === true }),
  });
  if (!response.ok) throw new MessageApiError(response.status, 'Beskeden kunne ikke analyseres.');
  const raw = await response.json() as { analysis?: unknown; historySaved?: unknown; webSearch?: Partial<MessageWebSearchStatus> };
  const analysis = MessageAnalysisResultSchema.parse(raw.analysis);
  if (analysis.mode !== 'model_analysis') throw new MessageApiError(502, 'Serveren returnerede ikke en produktionsanalyse.');
  return {
    analysis,
    historySaved: raw.historySaved === true,
    webSearch: {
      requested: raw.webSearch?.requested === true,
      used: raw.webSearch?.used === true,
      sourceCount: typeof raw.webSearch?.sourceCount === 'number' ? raw.webSearch.sourceCount : 0,
      failed: raw.webSearch?.failed === true,
    },
  };
}

export async function getMessageHistory(): Promise<MessageHistoryEntry[]> {
  const response = await fetch('/api/case/message-history', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new MessageApiError(response.status, 'Historikken kunne ikke hentes.');
  const raw = await response.json() as { history?: unknown };
  return MessageHistoryEntrySchema.array().parse(raw.history);
}
