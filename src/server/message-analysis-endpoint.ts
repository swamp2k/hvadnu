import { z } from 'zod';
import { buildReviewPlan, type ReviewContext, type ReviewPlan } from '../ai/routing';
import { MessageAnalysisResultSchema, type MessageAnalysisPayload, type MessageAnalysisResult } from '../domain/message-result';
import { D1AiUsageRepository } from '../storage/d1-ai-usage-repository';
import { D1MessageHistoryRepository, type MessageAnalysisContext, type MessageContextSource } from '../storage/d1-message-history-repository';
import type { D1Database } from '../storage/d1-types';
import { buildRuntimeGate, isAuthenticatedAccessIdentity, type WorkerEnv } from './document-analysis-endpoint';
import { evaluateDocumentAnalysisGate } from './document-analysis-service';
import { createAnthropicMessageAnalysisProvider, type MessageAnalysisProvider } from './anthropic-message-provider';
import { createAnthropicWebResearchProvider, type WebResearchProvider } from './anthropic-web-research-provider';

const MessageRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  webSearch: z.boolean().optional().default(false),
});
const MAX_MESSAGE_REQUEST_CHARACTERS = 25_000;
const MAX_REVIEW_SOURCE_CHARACTERS = 8_000;
export type MessageProviderFactory = (apiKey: string) => MessageAnalysisProvider;
export type WebResearchProviderFactory = (apiKey: string) => WebResearchProvider;

const CRITICAL_PATTERNS = [
  /\bvold\b/iu,
  /psykisk\s+vold/iu,
  /\bovergreb/iu,
  /seksuel(?:t|le)?\s+overgreb/iu,
  /\bbortfør/iu,
  /\bmisbrug\b/iu,
];
const MATERIAL_CHANGE_PATTERNS = [
  /\b(?:stopper|stoppe|aflyser|aflyse|nægter|nægte|ændrer|ændre|suspenderer|suspendere)\b.{0,80}\bsamvær\b/iu,
  /\bsamvær\b.{0,80}\b(?:stopper|stoppe|aflyser|aflyse|nægter|nægte|ændrer|ændre|suspenderer|suspendere)\b/iu,
  /\b(?:ændrer|ændre|flytter|flytte|kræver|kræve|søger|søge)\b.{0,80}\b(?:bopæl|forældremyndighed)\b/iu,
  /\b(?:bopæl|forældremyndighed)\b.{0,80}\b(?:ændrer|ændre|flytter|flytte|kræver|kræve|søger|søge)\b/iu,
  /\b(?:krav|betaling|betale|skylder|kompensation)\b.{0,80}\b\d{4,}\s*(?:kr|kroner)\b/iu,
  /\b\d{4,}\s*(?:kr|kroner)\b.{0,80}\b(?:krav|betaling|betale|skylder|kompensation)\b/iu,
  /\b(?:ikke|nægter|nægte)\b.{0,60}\b(?:udlevere|aflevere)\b/iu,
];
const DEADLINE_PATTERNS = [
  /\bfrist\b/iu,
  /\bdeadline\b/iu,
  /\bsenest\b/iu,
  /\binden\s+\d+\s+(?:dag|dage|uge|uger)\b/iu,
];

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

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function buildMessageReviewContext(message: string, payload: MessageAnalysisPayload, currentSourceId: string): ReviewContext {
  const critical = matchesAny(message, CRITICAL_PATTERNS);
  const materialChange = matchesAny(message, MATERIAL_CHANGE_PATTERNS);
  const highRisk = critical || materialChange || payload.legalAssessment.level === 'attention';
  const externalEvidenceCount = [...referencedSourceIds(payload)].filter((sourceId) => sourceId !== currentSourceId).length;
  const evidenceSufficiency: ReviewContext['evidenceSufficiency'] = externalEvidenceCount === 0
    ? 'insufficient'
    : payload.uncertainty.level === 'low' ? 'sufficient' : 'partial';

  return {
    riskLevel: critical ? 'critical' : highRisk ? 'high' : 'medium',
    legalUncertainty: payload.uncertainty.level,
    evidenceSufficiency,
    conflictingSources: payload.citations.some((citation) => citation.status === 'disputed'),
    bindingDeadlineDetected: matchesAny(message, DEADLINE_PATTERNS),
  };
}

function narrowReviewContext(context: MessageAnalysisContext, payload: MessageAnalysisPayload, currentSourceId: string): MessageAnalysisContext {
  const required = referencedSourceIds(payload);
  required.add(currentSourceId);

  const prioritized = [
    ...context.sources.filter((source) => required.has(source.sourceId)),
    ...context.sources.filter((source) => !required.has(source.sourceId)).slice(0, 3),
  ];
  const seen = new Set<string>();
  const sources: MessageContextSource[] = [];
  let used = 0;

  for (const source of prioritized) {
    const key = `${source.sourceId}:${source.locator}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (source.sourceId === currentSourceId) {
      sources.push(source);
      used += source.text.length;
      continue;
    }
    if (used >= MAX_REVIEW_SOURCE_CHARACTERS) break;
    const remaining = MAX_REVIEW_SOURCE_CHARACTERS - used;
    const text = source.text.slice(0, remaining);
    if (!text.trim()) continue;
    sources.push({ ...source, text });
    used += text.length;
  }

  return { currentState: context.currentState, sources };
}

function finalCitedWebSources(context: MessageAnalysisContext, payload: MessageAnalysisPayload): MessageContextSource[] {
  const referenced = referencedSourceIds(payload);
  return context.sources.filter((source) =>
    referenced.has(source.sourceId)
    && (source.sourceType === 'web_official' || source.sourceType === 'web_secondary'));
}

function finalizeAnalysis(payload: MessageAnalysisPayload, plan: ReviewPlan): MessageAnalysisResult {
  return MessageAnalysisResultSchema.parse({
    ...payload,
    mode: 'model_analysis',
    reviewPlan: plan,
  });
}

async function recordUsage(db: D1Database, usage: Parameters<D1AiUsageRepository['record']>[0]): Promise<void> {
  try {
    await new D1AiUsageRepository(db).record(usage);
  } catch {
    // Metadata telemetry must never make a valid analysis unavailable.
  }
}

export async function handleMessageAnalysisRequest(
  request: Request,
  env: WorkerEnv,
  authenticatedEmail: string | null | undefined,
  providerFactory: MessageProviderFactory = createAnthropicMessageAnalysisProvider,
  webResearchProviderFactory: WebResearchProviderFactory = createAnthropicWebResearchProvider,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authenticated = isAuthenticatedAccessIdentity(authenticatedEmail);
  if (!authenticated) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'persistence_unavailable' }, 503);

  const evaluation = evaluateDocumentAnalysisGate(buildRuntimeGate(env, authenticated));
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

    let webSearchFailed = false;
    if (parsed.data.webSearch) {
      try {
        const research = await webResearchProviderFactory(env.ANTHROPIC_API_KEY!).research(parsed.data.message);
        await recordUsage(env.DB, research.usage);
        context.sources.push(...research.sources);
      } catch {
        // Optional research must not make the core case/legal-library analysis unavailable.
        webSearchFailed = true;
      }
    }

    const provider = providerFactory(env.ANTHROPIC_API_KEY!);
    const first = await provider.analyze({ context });
    await recordUsage(env.DB, first.usage);
    const firstPayload = normalizeCitationMetadata(first.payload, context);
    assertKnownSourceIds(firstPayload, context);

    const reviewContext = buildMessageReviewContext(parsed.data.message, firstPayload, sourceId);
    const plan = buildReviewPlan(reviewContext);
    let finalPayload = firstPayload;

    if (plan.passes === 2) {
      const narrowContext = narrowReviewContext(context, firstPayload, sourceId);
      const reviewed = await provider.review({ context: narrowContext, firstAnalysis: firstPayload });
      await recordUsage(env.DB, reviewed.usage);
      const reviewedPayload = normalizeCitationMetadata(reviewed.payload, narrowContext);
      assertKnownSourceIds(reviewedPayload, narrowContext);
      finalPayload = reviewedPayload;
    }

    const analysis = finalizeAnalysis(finalPayload, plan);
    const citedWebSources = finalCitedWebSources(context, finalPayload);
    const webSearch = {
      requested: parsed.data.webSearch,
      used: citedWebSources.length > 0,
      sourceCount: citedWebSources.length,
      failed: webSearchFailed,
    };
    try {
      const saved = await repository.saveAnalyzedMessage(parsed.data.message, analysis, sourceId, citedWebSources);
      return json({ analysis, historySaved: true, webSearch, ...saved });
    } catch {
      return json({ analysis, historySaved: false, webSearch });
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
