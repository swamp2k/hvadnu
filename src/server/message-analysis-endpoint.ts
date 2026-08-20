import { z } from 'zod';
import { MessageToneSchema } from '../domain/message-tone';
import { MessageAnalysisResultSchema, type MessageAnalysisPayload, type MessageAnalysisResult } from '../domain/message-result';
import { D1AiUsageRepository } from '../storage/d1-ai-usage-repository';
import { D1MessageHistoryRepository, type MessageAnalysisContext, type MessageContextSource } from '../storage/d1-message-history-repository';
import type { D1Database } from '../storage/d1-types';
import { buildRuntimeGate, isAuthenticatedAccessIdentity, type WorkerEnv } from './document-analysis-endpoint';
import { evaluateDocumentAnalysisGate } from './document-analysis-service';
import { createAnthropicMessageAnalysisProvider, type MessageAnalysisProvider } from './anthropic-message-provider';

const MessageRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  tone: MessageToneSchema.optional().default('neutral'),
});
const MAX_MESSAGE_REQUEST_CHARACTERS = 25_000;
export type MessageProviderFactory = (apiKey: string) => MessageAnalysisProvider;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function referencedSourceIds(payload: MessageAnalysisPayload): Set<string> {
  const referenced = new Set<string>();
  for (const item of payload.caseContext) for (const sourceId of item.sourceIds) referenced.add(sourceId);
  for (const sourceId of payload.legalAssessment.sourceIds) referenced.add(sourceId);
  for (const citation of payload.citations) referenced.add(citation.sourceId);
  return referenced;
}

function assertKnownSourceIds(payload: MessageAnalysisPayload, context: MessageAnalysisContext): void {
  const known = new Set(context.sources.map((source) => source.sourceId));
  for (const entry of context.currentState) for (const ref of entry.sourceRefs) known.add(ref.sourceId);
  for (const sourceId of referencedSourceIds(payload)) if (!known.has(sourceId)) throw new Error('fabricated_source_id');
}

function normalizeCitationMetadata(payload: MessageAnalysisPayload, context: MessageAnalysisContext): MessageAnalysisPayload {
  const byId = new Map(context.sources.map((source) => [source.sourceId, source]));
  return {
    ...payload,
    citations: payload.citations.map((citation) => {
      const source = byId.get(citation.sourceId);
      return source ? {
        ...citation,
        label: source.label,
        status: source.status,
        locator: source.locator,
      } : citation;
    }),
  };
}

function appendWebCitations(payload: MessageAnalysisPayload, webSources: MessageContextSource[]): MessageAnalysisPayload {
  const existing = new Set(payload.citations.map((citation) => citation.sourceId));
  return {
    ...payload,
    citations: [
      ...payload.citations,
      ...webSources
        .filter((source) => !existing.has(source.sourceId))
        .map((source) => ({
          sourceId: source.sourceId,
          label: source.label,
          status: source.status,
          locator: source.locator,
        })),
    ],
  };
}

function finalizeAnalysis(payload: MessageAnalysisPayload): MessageAnalysisResult {
  return MessageAnalysisResultSchema.parse({
    ...payload,
    mode: 'model_analysis',
    reviewPlan: {
      model: 'claude-sonnet-5',
      passes: 1,
      humanReviewRecommended: false,
      reasons: [],
    },
  });
}

async function recordUsage(db: D1Database, usage: Parameters<D1AiUsageRepository['record']>[0]): Promise<void> {
  try {
    await new D1AiUsageRepository(db).record(usage);
  } catch {
    // Usage metadata must never make a valid analysis unavailable.
  }
}

export async function handleMessageAnalysisRequest(
  request: Request,
  env: WorkerEnv,
  authenticatedEmail: string | null | undefined,
  providerFactory: MessageProviderFactory = createAnthropicMessageAnalysisProvider,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'persistence_unavailable' }, 503);

  const evaluation = evaluateDocumentAnalysisGate(buildRuntimeGate(env, true));
  if (!evaluation.allowed) return json({ error: 'analysis_unavailable' }, 503);

  const rawBody = await request.text();
  if (rawBody.length > MAX_MESSAGE_REQUEST_CHARACTERS) return json({ error: 'request_too_large' }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = MessageRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'invalid_message' }, 400);

  const repository = new D1MessageHistoryRepository(env.DB);
  const sourceId = crypto.randomUUID();

  try {
    const context = await repository.getAnalysisContext(parsed.data.message);
    context.sources.unshift({
      sourceId,
      label: 'Aktuel besked',
      sourceType: 'message',
      locator: 'hele beskeden',
      text: parsed.data.message,
      status: 'unknown',
    });

    const provider = providerFactory(env.ANTHROPIC_API_KEY!);
    const modelResult = await provider.analyze({ context, tone: parsed.data.tone });
    await recordUsage(env.DB, modelResult.usage);

    const normalized = normalizeCitationMetadata(modelResult.payload, context);
    assertKnownSourceIds(normalized, context);
    const analysis = finalizeAnalysis(appendWebCitations(normalized, modelResult.webSources));

    try {
      const saved = await repository.saveAnalyzedMessage(parsed.data.message, analysis, sourceId, modelResult.webSources);
      return json({ analysis, historySaved: true, ...saved });
    } catch {
      return json({ analysis, historySaved: false });
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'analysis_failed', errorType: name }, 502);
  }
}

export async function handleMessageHistoryRequest(
  request: Request,
  db: D1Database | undefined,
  authenticatedEmail: string | null | undefined,
): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'persistence_unavailable' }, 503);

  try {
    return json({ history: await new D1MessageHistoryRepository(db).listHistory() });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'message_history_failed', errorType: name }, 502);
  }
}
