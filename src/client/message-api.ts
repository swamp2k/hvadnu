import { MessageAnalysisResultSchema, MessageHistoryEntrySchema, type MessageAnalysisResult, type MessageHistoryEntry } from '../domain/message-result';

export class MessageApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'MessageApiError';
  }
}

export async function analyzeMessage(message: string): Promise<{ analysis: MessageAnalysisResult; historySaved: boolean }> {
  const response = await fetch('/api/analyze-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new MessageApiError(response.status, 'Beskeden kunne ikke analyseres.');
  const raw = await response.json() as { analysis?: unknown; historySaved?: unknown };
  const analysis = MessageAnalysisResultSchema.parse(raw.analysis);
  if (analysis.mode !== 'model_analysis') throw new MessageApiError(502, 'Serveren returnerede ikke en produktionsanalyse.');
  return { analysis, historySaved: raw.historySaved === true };
}

export async function getMessageHistory(): Promise<MessageHistoryEntry[]> {
  const response = await fetch('/api/case/message-history', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new MessageApiError(response.status, 'Historikken kunne ikke hentes.');
  const raw = await response.json() as { history?: unknown };
  return MessageHistoryEntrySchema.array().parse(raw.history);
}
