import { z } from 'zod';
import { CaseQueryResultSchema } from '../domain/case-query';
import { D1AiUsageRepository } from '../storage/d1-ai-usage-repository';
import { D1MessageHistoryRepository } from '../storage/d1-message-history-repository';
import type { D1Database } from '../storage/d1-types';
import { createAnthropicCaseQueryProvider, type CaseQueryProvider } from './anthropic-case-query-provider';
import { buildRuntimeGate, isAuthenticatedAccessIdentity, type WorkerEnv } from './document-analysis-endpoint';
import { evaluateDocumentAnalysisGate } from './document-analysis-service';

const CaseQueryRequestSchema = z.object({
  question: z.string().trim().min(1).max(20_000),
});
const MAX_CASE_QUERY_REQUEST_CHARACTERS = 25_000;
const NO_CASE_MATCH_PREFIX = 'Jeg kan ikke finde noget i dine gemte beskeder eller dokumenter, der svarer på det spørgsmål.';
export type CaseQueryProviderFactory = (apiKey: string) => CaseQueryProvider;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function recordUsage(db: D1Database, usage: Parameters<D1AiUsageRepository['record']>[0]): Promise<void> {
  try {
    await new D1AiUsageRepository(db).record(usage);
  } catch {
    // Usage metadata must never make a useful answer unavailable.
  }
}

export async function handleCaseQueryRequest(
  request: Request,
  env: WorkerEnv,
  authenticatedEmail: string | null | undefined,
  providerFactory: CaseQueryProviderFactory = createAnthropicCaseQueryProvider,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'persistence_unavailable' }, 503);

  const evaluation = evaluateDocumentAnalysisGate(buildRuntimeGate(env, true));
  if (!evaluation.allowed) return json({ error: 'analysis_unavailable' }, 503);

  const rawBody = await request.text();
  if (rawBody.length > MAX_CASE_QUERY_REQUEST_CHARACTERS) return json({ error: 'request_too_large' }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = CaseQueryRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'invalid_question' }, 400);

  try {
    const context = await new D1MessageHistoryRepository(env.DB).getAnalysisContext(parsed.data.question);
    if (!context.caseMatchFound) {
      // getAnalysisContext keeps a small recent fallback for message analysis.
      // A case query with no FTS match should not leak unrelated recent material into a general web answer.
      context.sources = [];
    }
    const provider = providerFactory(env.ANTHROPIC_API_KEY!);
    const modelResult = await provider.query(parsed.data.question, context);
    await recordUsage(env.DB, modelResult.usage);

    const byId = new Map(context.sources.map((source) => [source.sourceId, source]));
    const knownStateIds = new Set(context.currentState.flatMap((entry) => entry.sourceRefs.map((ref) => ref.sourceId)));
    const unknownCaseSource = modelResult.payload.caseSourceIds.find((sourceId) => !byId.has(sourceId) && !knownStateIds.has(sourceId));
    if (unknownCaseSource) throw new Error('fabricated_source_id');

    const caseSources = modelResult.payload.caseSourceIds
      .map((sourceId) => byId.get(sourceId))
      .filter((source): source is NonNullable<typeof source> => Boolean(source))
      .map((source) => ({ label: source.label, locator: source.locator, kind: 'case' as const }));
    const webSources = modelResult.webSources.map((source) => ({
      label: source.label,
      locator: source.locator,
      kind: 'web' as const,
    }));
    const answer = context.caseMatchFound
      ? modelResult.payload.answer
      : `${NO_CASE_MATCH_PREFIX}\n\n${modelResult.payload.answer}`;

    const result = CaseQueryResultSchema.parse({
      ...modelResult.payload,
      answer,
      caseEvidenceFound: context.caseMatchFound,
      sources: [...caseSources, ...webSources],
    });
    return json({ result });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'case_query_failed', errorType: name }, 502);
  }
}
