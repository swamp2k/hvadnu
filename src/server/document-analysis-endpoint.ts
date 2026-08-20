import { ExtractedDocumentSchema } from '../domain/document';
import {
  createDocumentAnalysisService,
  evaluateDocumentAnalysisGate,
  type DocumentAnalysisGate,
  type DocumentAnalysisProvider,
} from './document-analysis-service';
import { createAnthropicDocumentAnalysisProvider } from './anthropic-document-provider';

export const MAX_ANALYSIS_REQUEST_CHARACTERS = 600_000;

export interface WorkerEnv {
  ANTHROPIC_API_KEY?: string;
  DOCUMENT_ANALYSIS_ENABLED?: string;
  PRIVATE_DEPLOYMENT_APPROVED?: string;
  ANTHROPIC_ZDR_APPROVED?: string;
  PAYLOAD_LOGGING_DISABLED?: string;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
}

export type ProviderFactory = (apiKey: string) => DocumentAnalysisProvider;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function enabled(value: string | undefined): boolean {
  return value === 'true';
}

export function buildRuntimeGate(env: WorkerEnv, authenticated: boolean): DocumentAnalysisGate {
  return {
    authenticated,
    privateDeploymentApproved: enabled(env.PRIVATE_DEPLOYMENT_APPROVED),
    retentionApproved: enabled(env.ANTHROPIC_ZDR_APPROVED),
    serverSideSecretConfigured: Boolean(env.ANTHROPIC_API_KEY),
    payloadLoggingDisabled: enabled(env.PAYLOAD_LOGGING_DISABLED),
    featureEnabled: enabled(env.DOCUMENT_ANALYSIS_ENABLED),
  };
}

export function isAuthenticatedAccessIdentity(authenticatedEmail: string | null | undefined): boolean {
  return Boolean(authenticatedEmail?.trim());
}

export function handleDocumentAnalysisStatusRequest(
  request: Request,
  env: WorkerEnv,
  authenticatedEmail: string | null,
): Response {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const authenticated = isAuthenticatedAccessIdentity(authenticatedEmail);
  if (!authenticated) return json({ available: false }, 401);

  const gate = buildRuntimeGate(env, authenticated);
  const decision = evaluateDocumentAnalysisGate(gate);
  return json({ available: decision.allowed });
}

export async function handleDocumentAnalysisRequest(
  request: Request,
  env: WorkerEnv,
  authenticatedEmail: string | null,
  providerFactory: ProviderFactory = createAnthropicDocumentAnalysisProvider,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authenticated = isAuthenticatedAccessIdentity(authenticatedEmail);
  if (!authenticated) return json({ error: 'unauthorized' }, 401);

  const gate = buildRuntimeGate(env, authenticated);
  const decision = evaluateDocumentAnalysisGate(gate);
  if (!decision.allowed) return json({ error: 'analysis_unavailable' }, 503);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const parsed = ExtractedDocumentSchema.safeParse(rawBody);
  if (!parsed.success) return json({ error: 'invalid_document' }, 400);

  const actualCharacterCount = parsed.data.pages.reduce((sum, page) => sum + page.text.length, 0);
  if (actualCharacterCount > MAX_ANALYSIS_REQUEST_CHARACTERS) {
    return json({ error: 'document_too_large_for_single_analysis' }, 413);
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'analysis_unavailable' }, 503);

  try {
    const service = createDocumentAnalysisService(providerFactory(apiKey));
    const explanation = await service.analyze(parsed.data, gate);
    return json(explanation);
  } catch {
    return json({ error: 'analysis_failed' }, 502);
  }
}
