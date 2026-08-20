import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  handleDocumentAnalysisRequest,
  handleDocumentAnalysisStatusRequest,
  type WorkerEnv,
} from './document-analysis-endpoint';

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

  // Compatibility path for existing/self-hosted Access applications. Cloudflare's
  // application token is verified cryptographically against the account signing keys,
  // issuer and this application's audience before the request is trusted.
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

      if (url.pathname === '/api/analysis-status') {
        return handleDocumentAnalysisStatusRequest(
          request,
          env,
          await resolveAccessEmail(request, env, ctx, verifyJwt),
        );
      }

      if (url.pathname === '/api/analyze-document') {
        return handleDocumentAnalysisRequest(
          request,
          env,
          await resolveAccessEmail(request, env, ctx, verifyJwt),
        );
      }

      return new Response('Not found', { status: 404 });
    },
  };
}

export default createWorker();
