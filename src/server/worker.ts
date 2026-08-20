import { createRemoteJWKSet, jwtVerify } from 'jose';
import { handleAiUsageRequest } from './ai-usage-endpoint';
import {
  handleCaseDeleteRequest,
  handleCaseExportRequest,
  handleCaseImportDocumentRequest,
  handleCaseSnapshotRequest,
} from './case-endpoint';
import { handleCaseQueryRequest } from './case-query-endpoint';
import {
  handleDocumentAnalysisRequest,
  handleDocumentAnalysisStatusRequest,
  type WorkerEnv,
} from './document-analysis-endpoint';
import { handleMessageAnalysisRequest, handleMessageHistoryRequest } from './message-analysis-endpoint';

interface AccessIdentity {
  email?: string;
}

interface WorkerAccessContext {
  access?: {
    getIdentity(): Promise<AccessIdentity | null>;
  };
}

export type AccessJwtVerifier = (token: string, env: WorkerEnv) => Promise<string | null>;

const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email ? email : null;
}

function normalizedTeamDomain(value: string | undefined): string | null {
  if (!value) return null;
  const domain = value.trim().replace(/\/+$/u, '');
  if (!domain.startsWith('https://')) return null;
  return domain;
}

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksByTeamDomain.get(teamDomain);
  if (existing) return existing;

  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  jwksByTeamDomain.set(teamDomain, jwks);
  return jwks;
}

export async function verifyClassicAccessJwt(token: string, env: WorkerEnv): Promise<string | null> {
  const teamDomain = normalizedTeamDomain(env.TEAM_DOMAIN);
  const audience = env.POLICY_AUD?.trim();
  if (!teamDomain || !audience) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience,
      algorithms: ['RS256'],
    });
    return normalizedEmail(payload.email);
  } catch {
    return null;
  }
}

export async function resolveAccessEmail(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerAccessContext,
  verifyJwt: AccessJwtVerifier = verifyClassicAccessJwt,
): Promise<string | null> {
  if (ctx.access) {
    try {
      const identity = await ctx.access.getIdentity();
      return normalizedEmail(identity?.email);
    } catch {
      return null;
    }
  }

  const assertion = request.headers.get('cf-access-jwt-assertion')?.trim();
  if (!assertion) return null;

  return verifyJwt(assertion, env);
}

export function createWorker(verifyJwt: AccessJwtVerifier = verifyClassicAccessJwt) {
  return {
    async fetch(request: Request, env: WorkerEnv, ctx: WorkerAccessContext): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }

      const accessEmail = await resolveAccessEmail(request, env, ctx, verifyJwt);

      if (url.pathname === '/api/analysis-status') {
        return handleDocumentAnalysisStatusRequest(request, env, accessEmail);
      }

      if (url.pathname === '/api/analyze-document') {
        return handleDocumentAnalysisRequest(request, env, accessEmail);
      }

      if (url.pathname === '/api/analyze-message') {
        return handleMessageAnalysisRequest(request, env, accessEmail);
      }

      if (url.pathname === '/api/ai-usage') {
        return handleAiUsageRequest(request, env.DB, accessEmail);
      }

      if (url.pathname === '/api/case') {
        return handleCaseSnapshotRequest(request, env.DB, accessEmail);
      }

      if (url.pathname === '/api/case/query') {
        return handleCaseQueryRequest(request, env, accessEmail);
      }

      if (url.pathname === '/api/case/import-document') {
        return handleCaseImportDocumentRequest(request, env.DB, accessEmail);
      }

      if (url.pathname === '/api/case/message-history') {
        return handleMessageHistoryRequest(request, env.DB, accessEmail);
      }

      if (url.pathname === '/api/case/export') {
        return handleCaseExportRequest(request, env.DB, accessEmail);
      }

      if (url.pathname === '/api/case/delete') {
        return handleCaseDeleteRequest(request, env.DB, accessEmail);
      }

      return new Response('Not found', { status: 404 });
    },
  };
}

export default createWorker();
