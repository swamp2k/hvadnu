import { z } from 'zod';
import { MessageAnalysisResultSchema, type MessageAnalysisPayload, type MessageAnalysisResult } from '../domain/message-result';
import { D1MessageHistoryRepository, type MessageAnalysisContext } from '../storage/d1-message-history-repository';
import type { D1Database } from '../storage/d1-types';
import { buildRuntimeGate, isAuthenticatedAccessIdentity, type WorkerEnv } from './document-analysis-endpoint';
import { evaluateDocumentAnalysisGate } from './document-analysis-service';
import { createAnthropicMessageAnalysisProvider, type MessageAnalysisProvider } from './anthropic-message-provider';

const MessageRequestSchema = z.object({ message: z.string().trim().min(1).max(20_000) });
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

function assertKnownSourceIds(payload: MessageAnalysisPayload, context: MessageAnalysisContext): void {
  const known = new Set(context.sources.map((source) => source.sourceId));
  for (const entry of context.currentState) {
    for (const ref of entry.sourceRefs) known.add(ref.sourceId);
  }

  const referenced = new Set<string>();
  for (const item of payload.caseContext) for (const sourceId of item.sourceIds) referenced.add(sourceId);
  for (const sourceId of payload.legalAssessment.sourceIds) referenced.add(sourceId);
  for (const citation of payload.citations) referenced.add(citation.sourceId);

  for (const sourceId of referenced) {
    if (!known.has(sourceId)) throw new Error('fabricated_source_id');
  }
}

function finalizeAnalysis(payload: MessageAnalysisPayload): MessageAnalysisResult {
  const humanReviewRecommended = payload.legalAssessment.level === 'attention' || payload.uncertainty.level === 'high';
  const reasons = [
    ...(payload.legalAssessment.level === 'attention' ? ['Juridisk vurdering kræver opmærksomhed.'] : []),
    ...(payload.uncertainty.level === 'high' ? ['Kildegrundlaget har høj usikkerhed.'] : []),
  ];

  return MessageAnalysisResultSchema.parse({
    ...payload,
    mode: 'model_analysis',
    reviewPlan: {
      model: 'claude-sonnet-5',
      passes: 1,
      humanReviewRecommended,
      reasons,
    },
  });
}

export async function handleMessageAnalysisRequest(
  request: Request,
  env: WorkerEnv,
  authenticatedEmail: string | null | undefined,
  providerFactory: MessageProviderFactory = createAnthropicMessageAnalysisProvider,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authenticated = isAuthenticatedAccessIdentity(authenticatedEmail);
  if (!authenticated) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'persistence_unavailable' }, 503);

  const evaluation = evaluateDocumentAnalysisGate(buildRuntimeGate(env, authenticated));
  if (!evaluation.allowed) return json({ error: 'analysis_unavailable' }, 503);

  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = MessageRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'invalid_message' }, 400);

  const repository = new D1MessageHistoryRepository(env.DB);
  const sourceId = crypto.randomUUID();
  try {
    const context = await repository.getAnalysisContext();
    context.sources.unshift({
      sourceId,
      label: 'Aktuel besked',
      sourceType: 'message',
      locator: 'hele beskeden',
      text: parsed.data.message,
      status: 'unknown',
    });

    const provider = providerFactory(env.ANTHROPIC_API_KEY!);
    const payload = await provider.analyze({ message: parsed.data.message, context });
    assertKnownSourceIds(payload, context);
    const analysis = finalizeAnalysis(payload);

    try {
      const saved = await repository.saveAnalyzedMessage(parsed.data.message, analysis, sourceId);
      return json({ analysis, historySaved: true, ...saved });
    } catch {
      // The analysis remains useful even if persistence is temporarily unavailable.
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
