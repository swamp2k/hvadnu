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

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email ? email : null;
}

async function getLegacyAccessEmail(request: Request, fetchImpl: FetchLike): Promise<string | null> {
  const assertion = request.headers.get('cf-access-jwt-assertion')?.trim();
  if (!assertion) return null;

  const identityUrl = new URL(request.url);
  identityUrl.pathname = '/cdn-cgi/access/get-identity';
  identityUrl.search = '';
  identityUrl.hash = '';

  try {
    const response = await fetchImpl(identityUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: `CF_Authorization=${assertion}`,
      },
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!response.ok) return null;

    const identity: unknown = await response.json();
    if (!identity || typeof identity !== 'object' || !('email' in identity)) return null;
    return normalizedEmail(identity.email);
  } catch {
    return null;
  }
}

export async function resolveAccessEmail(
  request: Request,
  ctx: WorkerAccessContext,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  if (ctx.access) {
    try {
      const identity = await ctx.access.getIdentity();
      return normalizedEmail(identity?.email);
    } catch {
      return null;
    }
  }

  // Compatibility path for hostname/self-hosted Access applications created before
  // Worker-native ctx.access. Access itself validates the application token at the
  // reserved /cdn-cgi/access/get-identity endpoint on this same protected host.
  return getLegacyAccessEmail(request, fetchImpl);
}

export function createWorker(fetchImpl: FetchLike = fetch) {
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
        return handleDocumentAnalysisStatusRequest(request, env, await resolveAccessEmail(request, ctx, fetchImpl));
      }

      if (url.pathname === '/api/analyze-document') {
        return handleDocumentAnalysisRequest(request, env, await resolveAccessEmail(request, ctx, fetchImpl));
      }

      return new Response('Not found', { status: 404 });
    },
  };
}

export default createWorker();
