import { D1AiUsageRepository } from '../storage/d1-ai-usage-repository';
import type { D1Database } from '../storage/d1-types';
import { isAuthenticatedAccessIdentity } from './document-analysis-endpoint';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function handleAiUsageRequest(
  request: Request,
  db: D1Database | undefined,
  authenticatedEmail: string | null | undefined,
): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'persistence_unavailable' }, 503);

  const url = new URL(request.url);
  const rawDays = Number.parseInt(url.searchParams.get('days') ?? '30', 10);
  const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(rawDays, 365)) : 30;

  try {
    return json({ days, usage: await new D1AiUsageRepository(db).summarize(days) });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'ai_usage_unavailable', errorType: name }, 502);
  }
}
