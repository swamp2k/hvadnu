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
  ALLOWED_EMAIL?: string;
  DOCUMENT_ANALYSIS_ENABLED?: string;
  PRIVATE_DEPLOYMENT_APPROVED?: string;
  ANTHROPIC_ZDR_APPROVED?: string;
  PAYLOAD_LOGGING_DISABLED?: string;
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
    enabled: enabled(env.DOCUMENT_ANALYSIS_ENABLED),
    authenticationEnforced: authenticated,
    privateDeployment: enabled(env.PRIVATE_DEPLOYMENT_APPROVED),
    anthropicRetentionApproved: enabled(env.ANTHROPIC_ZDR_APPROVED),
    serverSideSecretConfigured: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    payloadLoggingDisabled: enabled(env.PAYLOAD_LOGGING_DISABLED),
  };
}

export function isAuthorizedAccessRequest(request: Request, env: WorkerEnv): boolean {
  const allowed = env.ALLOWED_EMAIL?.trim().toLowerCase();
  const authenticatedEmail = request.headers.get('cf-access-authenticated-user-email')?.trim().toLowerCase();
  return Boolean(allowed && authenticatedEmail && allowed === authenticatedEmail);
}

export async function handleDocumentAnalysisRequest(
  request: Request,
  env: WorkerEnv,
  providerFactory: ProviderFactory = createAnthropicDocumentAnalysisProvider,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authenticated = isAuthorizedAccessRequest(request, env);
  if (!authenticated) return json({ error: 'unauthorized' }, 401);

  const gate = buildRuntimeGate(env, authenticated);
  const evaluation = evaluateDocumentAnalysisGate(gate);
  if (!evaluation.allowed) {
    return json({ error: 'analysis_unavailable', blockers: evaluation.blockers }, 503);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_ANALYSIS_REQUEST_CHARACTERS) {
    return json({ error: 'request_too_large' }, 413);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const documentResult = ExtractedDocumentSchema.safeParse(parsedJson);
  if (!documentResult.success) return json({ error: 'invalid_document' }, 400);

  try {
    const provider = providerFactory(env.ANTHROPIC_API_KEY!);
    const service = createDocumentAnalysisService(gate, provider);
    const analysis = await service.analyze(documentResult.data);
    return json({ analysis });
  } catch (error) {
    // Never log request/document/model payloads here. Production observability must remain metadata-only.
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'analysis_failed', errorType: name }, 502);
  }
}
